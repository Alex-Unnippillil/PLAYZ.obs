// SPDX-License-Identifier: GPL-2.0-or-later
// Original PLAYZ host. No Ascent wrapper code is incorporated.
#include <windows.h>
#include <obs.h>
#include <util/platform.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using json = nlohmann::json;
namespace fs = std::filesystem;
using namespace std::chrono_literals;
using Data = std::unique_ptr<obs_data_t, decltype(&obs_data_release)>;
static constexpr size_t max_frame = 65536;
static constexpr int protocol = 1;
static Data data() { return Data(obs_data_create(), obs_data_release); }
static void require(bool b, const char *message) { if (!b) throw std::runtime_error(message); }
static std::string utf8(const fs::path &p) { auto v = p.u8string(); return std::string(v.begin(), v.end()); }
static fs::path executable_dir() {
  std::vector<wchar_t> buf(32768);
  DWORD n = GetModuleFileNameW(nullptr, buf.data(), static_cast<DWORD>(buf.size()));
  require(n > 0 && n < buf.size(), "Cannot resolve recorder installation");
  return fs::path(std::wstring(buf.data(), n)).parent_path();
}
static void pump() {
  MSG message{};
  while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
    TranslateMessage(&message); DispatchMessageW(&message);
  }
  std::this_thread::sleep_for(25ms);
}
// stdout is exclusively the bounded parent/child protocol. No public pipe or port.
static void log_handler(int level, const char *format, va_list args, void *) {
  if (level > LOG_WARNING) return;
  char text[2048]; vsnprintf(text, sizeof(text), format, args);
  // Native diagnostics may contain paths: the supervisor drains and discards
  // these lines by default. Only explicitly redacted diagnostics leave the core.
  std::fprintf(stderr, "[obs:%d] %s\n", level, text);
}
static bool read_frame(std::string &out) {
  out.clear();
  char ch;
  while (std::cin.get(ch)) {
    if (ch == '\n') return true;
    if (ch != '\r') out.push_back(ch);
    if (out.size() > max_frame) throw std::runtime_error("IPC frame exceeds 64 KiB");
  }
  return !out.empty();
}
static void validate_request(const json &r) {
  require(r.is_object(), "Request must be an object");
  require(r.contains("v") && r["v"].is_number_integer() && r["v"] == protocol, "Unsupported protocol version");
  require(r.contains("id") && r["id"].is_string(), "Missing correlation ID");
  const auto id = r["id"].get<std::string>();
  require(!id.empty() && id.size() <= 80, "Invalid correlation ID");
  require(r.contains("op") && r["op"].is_string() && r["op"].get<std::string>().size() < 32, "Missing operation");
}
static json choices(const char *source, const char *property) {
  json values = json::array();
  auto *props = obs_get_source_properties(source);
  if (!props) return values;
  auto *p = obs_properties_get(props, property);
  if (p && obs_property_get_type(p) == OBS_PROPERTY_LIST) {
    auto count = std::min<size_t>(obs_property_list_item_count(p), 512);
    for (size_t i = 0; i < count; ++i) {
      const char *value = obs_property_list_item_string(p, i);
      const char *name = obs_property_list_item_name(p, i);
      if (value && *value && name && !obs_property_list_item_disabled(p, i))
        values.push_back({{"id", value}, {"label", name}});
    }
  }
  obs_properties_destroy(props);
  return values;
}
static bool includes(const json &a, const std::string &id) {
  return std::any_of(a.begin(), a.end(), [&](const json &v) { return v.value("id", "") == id; });
}

class Engine {
  fs::path root_;
  bool initialized_ = false;
  obs_scene_t *scene_ = nullptr;
  obs_source_t *video_ = nullptr;
  obs_source_t *desktop_ = nullptr;
  obs_source_t *microphone_ = nullptr;
  obs_encoder_t *vencoder_ = nullptr;
  obs_encoder_t *aencoder_ = nullptr;
  obs_output_t *output_ = nullptr;
  std::atomic<bool> started_{false};
  std::atomic<bool> stopped_{true};
  std::atomic<int> stop_code_{0};
  std::string session_;
  fs::path path_;
  unsigned fps_ = 30;
  static void on_start(void *self, calldata_t *) { static_cast<Engine *>(self)->started_ = true; }
  static void on_stop(void *self, calldata_t *d) {
    auto *s = static_cast<Engine *>(self);
    s->stop_code_ = static_cast<int>(calldata_int(d, "code"));
    s->stopped_ = true;
  }
  void load_module(const char *name) {
    const auto binary = root_ / "obs-plugins" / "64bit" / (std::string(name) + ".dll");
    if (!fs::exists(binary)) return;
    const auto assets = root_ / "data" / "obs-plugins" / name;
    obs_module_t *module = nullptr;
    if (obs_open_module(&module, utf8(binary).c_str(), utf8(assets).c_str()) == MODULE_SUCCESS)
      obs_init_module(module);
  }
  void release_session() {
    if (output_) {
      auto *signals = obs_output_get_signal_handler(output_);
      signal_handler_disconnect(signals, "start", on_start, this);
      signal_handler_disconnect(signals, "stop", on_stop, this);
      obs_output_release(output_); output_ = nullptr;
    }
    if (vencoder_) { obs_encoder_release(vencoder_); vencoder_ = nullptr; }
    if (aencoder_) { obs_encoder_release(aencoder_); aencoder_ = nullptr; }
    if (initialized_) for (uint32_t i = 0; i < 3; ++i) obs_set_output_source(i, nullptr);
    if (scene_) { obs_scene_release(scene_); scene_ = nullptr; }
    if (video_) { obs_source_release(video_); video_ = nullptr; }
    if (desktop_) { obs_source_release(desktop_); desktop_ = nullptr; }
    if (microphone_) { obs_source_release(microphone_); microphone_ = nullptr; }
  }
  obs_source_t *audio_source(const char *kind, const char *name, const std::string &id) {
    require(includes(choices(kind, "device_id"), id), "Selected audio device is unavailable; no replacement was activated");
    auto s = data(); obs_data_set_string(s.get(), "device_id", id.c_str());
    obs_data_set_bool(s.get(), "use_device_timing", true);
    auto *source = obs_source_create(kind, name, s.get(), nullptr);
    require(source != nullptr, "Audio source could not be created");
    obs_source_set_audio_mixers(source, 1);
    return source;
  }
public:
  explicit Engine(fs::path root) : root_(std::move(root)) {}
  ~Engine() {
    try { stop(); } catch (...) { if (output_) obs_output_force_stop(output_); }
    release_session();
    if (initialized_) obs_shutdown();
  }
  void initialize() {
    if (initialized_) return;
    base_set_log_handler(log_handler, nullptr);
    require(obs_startup("en-US", nullptr, nullptr), "libobs could not initialize");
    initialized_ = true;
    obs_add_data_path(utf8(root_ / "data" / "libobs").c_str());
    struct obs_audio_info audio{};
    audio.samples_per_sec = 48000; audio.speakers = SPEAKERS_STEREO;
    require(obs_reset_audio(&audio), "48 kHz audio initialization failed");
    configure_video(1920, 1080, 30);
    // Explicit allowlist: no browser, websocket, virtual camera or third-party plugins.
    for (const char *name : {"obs-ffmpeg", "obs-x264", "obs-outputs", "win-capture", "win-wasapi", "obs-nvenc", "obs-qsv11"}) load_module(name);
    obs_post_load_modules();
  }
  void configure_video(unsigned width, unsigned height, unsigned fps) {
    struct obs_video_info v{};
    const std::string graphics = utf8(root_ / "bin" / "64bit" / "libobs-d3d11.dll");
    v.graphics_module = graphics.c_str();
    v.fps_num = fps; v.fps_den = 1;
    v.base_width = v.output_width = width; v.base_height = v.output_height = height;
    v.output_format = VIDEO_FORMAT_NV12; v.adapter = 0; v.gpu_conversion = true;
    v.colorspace = VIDEO_CS_709; v.range = VIDEO_RANGE_PARTIAL; v.scale_type = OBS_SCALE_BICUBIC;
    require(obs_reset_video(&v) == OBS_VIDEO_SUCCESS, "Direct3D 11 video initialization failed. Check the graphics driver and interactive Windows session.");
    fps_ = fps;
  }
  json capabilities() {
    initialize();
    json targets = json::array();
    // No monitor fallback is implemented: target loss never broadens scope.
    for (const auto &[kind, source] : std::vector<std::pair<std::string, std::string>>{{"window", "window_capture"}, {"game", "game_capture"}}) {
      for (auto entry : choices(source.c_str(), "window")) {
        entry["kind"] = kind; targets.push_back(entry);
      }
    }
    json encoders = json::array();
    const char *id = nullptr;
    for (size_t i = 0; obs_enum_encoder_types(i, &id); ++i) {
      const char *codec = obs_get_encoder_codec(id);
      if (codec && std::string(codec) == "h264") {
        const char *name = obs_encoder_get_display_name(id);
        encoders.push_back({{"id", id}, {"label", name ? name : id}, {"hardware", std::string(id) != "obs_x264"}, {"hardware_validated", false}});
      }
    }
    return {{"protocol", protocol}, {"engine_version", obs_get_version_string()}, {"targets", targets}, {"encoders", encoders},
      {"audio_outputs", choices("wasapi_output_capture", "device_id")}, {"audio_inputs", choices("wasapi_input_capture", "device_id")}};
  }
  json status() const {
    uint64_t frames = output_ ? obs_output_get_total_frames(output_) : 0;
    uint64_t bytes = 0;
    std::error_code error;
    if (!path_.empty() && fs::exists(path_, error)) bytes = fs::file_size(path_, error);
    if (error) bytes = 0;
    return {{"session_id", session_}, {"active", output_ && obs_output_active(output_) && started_ && !stopped_},
      {"started", started_.load()}, {"stopped", stopped_.load()}, {"stop_code", stop_code_.load()},
      {"frames", std::to_string(frames)}, {"bytes", std::to_string(bytes)},
      {"media_ms", static_cast<double>(frames) * 1000.0 / fps_},
      {"video_width", video_ ? obs_source_get_width(video_) : 0},
      {"video_height", video_ ? obs_source_get_height(video_) : 0},
      {"timeline_basis", "encoded_output_frame_count"}};
  }
  json start(const json &r) {
    initialize();
    const auto sid = r.at("session_id").get<std::string>();
    if (output_ && obs_output_active(output_)) {
      require(sid == session_, "A different recording is already active");
      return status();
    }
    require(!sid.empty() && sid.size() <= 80, "Invalid session ID");
    const auto kind = r.at("kind").get<std::string>();
    const auto target = r.at("target_id").get<std::string>();
    require(kind == "window" || kind == "game", "Only explicitly selected window/game capture is supported");
    const char *source_id = kind == "window" ? "window_capture" : "game_capture";
    require(includes(choices(source_id, "window"), target), "The selected target is no longer available. Capture was not widened.");
    const auto width = r.at("width").get<unsigned>();
    const auto height = r.at("height").get<unsigned>();
    const auto fps = r.at("fps").get<unsigned>();
    const auto bitrate = r.at("bitrate_kbps").get<unsigned>();
    require(((width == 1920 && height == 1080) || (width == 1280 && height == 720)) && (fps == 30 || fps == 60), "Unsupported SDR profile");
    require(bitrate >= 2000 && bitrate <= 80000, "Invalid video bitrate");
    auto requested_path = fs::u8path(r.at("path").get<std::string>());
    require(requested_path.is_absolute() && requested_path.extension() == ".mkv" && !fs::exists(requested_path), "Output must be a new absolute MKV path");
    require(fs::is_directory(requested_path.parent_path()), "Output directory is unavailable");
    release_session();
    configure_video(width, height, fps);
    session_ = sid; path_ = requested_path;
    started_ = false; stopped_ = false; stop_code_ = 0;
    try {
      auto vs = data();
      obs_data_set_string(vs.get(), "window", target.c_str());
      obs_data_set_int(vs.get(), "priority", 0); // exact title, never another executable
      obs_data_set_bool(vs.get(), "cursor", true);
      obs_data_set_bool(vs.get(), "capture_cursor", true);
      if (kind == "game") {
        obs_data_set_string(vs.get(), "capture_mode", "window");
        obs_data_set_bool(vs.get(), "anti_cheat_hook", true);
      }
      video_ = obs_source_create(source_id, "PLAYZ selected target", vs.get(), nullptr);
      require(video_ != nullptr, "Video source could not be created");
      scene_ = obs_scene_create("PLAYZ capture");
      require(scene_ != nullptr, "Scene creation failed");
      auto *item = obs_scene_add(scene_, video_);
      require(item != nullptr, "Could not attach capture source");
      struct vec2 bounds{}; bounds.x = static_cast<float>(width); bounds.y = static_cast<float>(height);
      obs_sceneitem_set_bounds_type(item, OBS_BOUNDS_SCALE_INNER);
      obs_sceneitem_set_bounds(item, &bounds);
      obs_set_output_source(0, obs_scene_get_source(scene_));
      if (r.value("desktop_audio", true)) {
        desktop_ = audio_source("wasapi_output_capture", "PLAYZ system mix", r.value("audio_output_id", std::string("default")));
        obs_set_output_source(1, desktop_);
      }
      const auto mic = r.value("microphone_id", std::string());
      if (!mic.empty()) { microphone_ = audio_source("wasapi_input_capture", "PLAYZ microphone (opt-in)", mic); obs_set_output_source(2, microphone_); }
      auto es = data();
      obs_data_set_string(es.get(), "rate_control", "CBR"); obs_data_set_int(es.get(), "bitrate", bitrate);
      obs_data_set_int(es.get(), "keyint_sec", 2); obs_data_set_string(es.get(), "preset", "veryfast");
      obs_data_set_string(es.get(), "profile", "high");
      const auto encoder = r.value("encoder_id", std::string("obs_x264"));
      auto discovered = capabilities()["encoders"];
      require(includes(discovered, encoder), "Selected H.264 encoder is not available");
      vencoder_ = obs_video_encoder_create(encoder.c_str(), "PLAYZ H264", es.get(), nullptr);
      require(vencoder_ != nullptr, "Selected encoder could not initialize. No silent fallback was used.");
      auto as = data(); obs_data_set_int(as.get(), "bitrate", 192);
      aencoder_ = obs_audio_encoder_create("ffmpeg_aac", "PLAYZ mixed AAC", as.get(), 0, nullptr);
      require(aencoder_ != nullptr, "AAC encoder is missing");
      obs_encoder_set_video(vencoder_, obs_get_video()); obs_encoder_set_audio(aencoder_, obs_get_audio());
      auto os = data(); obs_data_set_string(os.get(), "path", utf8(path_).c_str());
      output_ = obs_output_create("ffmpeg_muxer", "PLAYZ MKV master", os.get(), nullptr);
      require(output_ != nullptr, "OBS MKV muxer is missing");
      obs_output_set_video_encoder(output_, vencoder_); obs_output_set_audio_encoder(output_, aencoder_, 0);
      auto *signals = obs_output_get_signal_handler(output_);
      signal_handler_connect(signals, "start", on_start, this); signal_handler_connect(signals, "stop", on_stop, this);
      require(obs_output_start(output_), "OBS rejected recording start. Check encoder, device and write access.");
      auto deadline = std::chrono::steady_clock::now() + 15s;
      while (std::chrono::steady_clock::now() < deadline && !stopped_) {
        auto s = status();
        if (started_ && s["active"] == true && std::stoull(s["bytes"].get<std::string>()) > 0 &&
            std::stoull(s["frames"].get<std::string>()) > 0 && s["video_width"].get<unsigned>() > 0) return s;
        pump();
      }
      throw std::runtime_error("No confirmed encoded output from selected target. Partial media was preserved; choose another target or check game compatibility.");
    } catch (...) {
      try { stop(); } catch (...) { if (output_) obs_output_force_stop(output_); }
      throw;
    }
  }
  json stop() {
    if (!output_ || !obs_output_active(output_)) return status();
    obs_output_stop(output_);
    auto deadline = std::chrono::steady_clock::now() + 20s;
    while (!stopped_ && std::chrono::steady_clock::now() < deadline) pump();
    require(stopped_, "Recording finalization timed out; preserve and recover the MKV master");
    require(stop_code_ == 0, "OBS reported an output failure; preserve and recover the MKV master");
    return status();
  }
};

static int self_test() {
  validate_request({{"v", 1}, {"id", "test"}, {"op", "status"}});
  unsigned rejected = 0;
  for (const auto &bad : std::vector<json>{nullptr, json::array(), {{"v", 99}, {"id", "test"}, {"op", "status"}}, {{"v", 1}, {"id", ""}, {"op", "status"}}, {{"v", 1}, {"id", 2}, {"op", "status"}}}) {
    try { validate_request(bad); } catch (...) { ++rejected; }
  }
  require(rejected == 5, "Protocol negative cases failed");
  std::cout << "PLAYZ protocol tests passed (capture not exercised)\n";
  return 0;
}
int main(int argc, char **argv) {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_USER_DIRS);
  const auto bin = executable_dir(); AddDllDirectory(bin.c_str());
  fs::current_path(bin);
  if (argc == 2 && std::string(argv[1]) == "--self-test") return self_test();
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  int result = 0;
  {
    Engine engine(bin.parent_path().parent_path());
    std::string frame;
    try {
      while (read_frame(frame)) {
        std::string id = "invalid"; bool quit = false;
        json response;
        try {
          auto request = json::parse(frame); validate_request(request); id = request["id"];
          const auto op = request["op"].get<std::string>();
          json value;
          if (op == "capabilities") value = engine.capabilities();
          else if (op == "start") value = engine.start(request);
          else if (op == "status") value = engine.status();
          else if (op == "stop") value = engine.stop();
          else if (op == "shutdown") { value = engine.stop(); quit = true; }
          else throw std::runtime_error("Unknown operation");
          response = {{"v", protocol}, {"id", id}, {"ok", true}, {"result", value}};
        } catch (const std::exception &e) {
          response = {{"v", protocol}, {"id", id}, {"ok", false}, {"error", std::string(e.what()).substr(0, 1024)}};
        }
        auto text = response.dump();
        if (text.size() > max_frame) text = json({{"v", protocol}, {"id", id}, {"ok", false}, {"error", "Capability response exceeds protocol limit"}}).dump();
        std::cout << text << '\n' << std::flush;
        if (quit) break;
      }
    } catch (const std::exception &) { result = 2; }
  }
  CoUninitialize();
  return result;
}
