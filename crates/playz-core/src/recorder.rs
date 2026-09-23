// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    contracts::{Capabilities, PROTOCOL_VERSION},
    error::{Error, Result},
    process::{self, ProcessJob},
};
use serde_json::{Value, json};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout},
    time::timeout,
};

const MAX_FRAME: usize = 65536;
pub struct Recorder {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    stderr: tokio::task::JoinHandle<()>,
    _job: ProcessJob,
    healthy: bool,
}
impl Recorder {
    pub fn spawn(executable: &Path) -> Result<Self> {
        let mut command = process::command(executable)?;
        command.stdin(Stdio::piped());
        let mut child = command.spawn()?;
        let job = ProcessJob::attach(&child)?;
        let input = child
            .stdin
            .take()
            .ok_or("Recorder input handle is unavailable")?;
        let output = BufReader::new(
            child
                .stdout
                .take()
                .ok_or("Recorder output handle is unavailable")?,
        );
        let stderr = process::discard_stderr(
            child
                .stderr
                .take()
                .ok_or("Recorder diagnostic handle is unavailable")?,
        );
        Ok(Self {
            child,
            input,
            output,
            stderr,
            _job: job,
            healthy: true,
        })
    }
    pub fn healthy(&self) -> bool {
        self.healthy
    }
    pub async fn request(&mut self, op: &str, mut args: Value, seconds: u64) -> Result<Value> {
        if !self.healthy {
            return Err(
                "Recorder connection is unavailable; interrupted media has been preserved".into(),
            );
        }
        let id = uuid::Uuid::new_v4().to_string();
        args["v"] = json!(PROTOCOL_VERSION);
        args["id"] = json!(id);
        args["op"] = json!(op);
        let mut payload = serde_json::to_vec(&args)?;
        if payload.len() > MAX_FRAME {
            return Err("Recorder request exceeds 64 KiB".into());
        }
        payload.push(b'\n');
        let result = timeout(Duration::from_secs(seconds), async {
            self.input.write_all(&payload).await?;
            self.input.flush().await?;
            let mut bytes = Vec::with_capacity(1024);
            loop {
                let byte = self.output.read_u8().await.map_err(|_| {
                    Error::Message(
                        "Recorder disconnected. Preserve the MKV and use Recover.".into(),
                    )
                })?;
                if byte == b'\n' {
                    break;
                }
                bytes.push(byte);
                if bytes.len() > MAX_FRAME {
                    return Err("Recorder response exceeds 64 KiB".into());
                }
            }
            let response: Value = serde_json::from_slice(&bytes)?;
            validate_response(&response, &id)?;
            if response["ok"] != true {
                return Err(Error::Message(
                    response["error"]
                        .as_str()
                        .unwrap_or("Recorder operation failed")
                        .chars()
                        .take(1024)
                        .collect(),
                ));
            }
            Ok(response["result"].clone())
        })
        .await;
        match result {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(e)) => {
                self.healthy = false;
                let _ = self.child.kill().await;
                Err(e)
            }
            Err(_) => {
                self.healthy = false;
                let _ = self.child.kill().await;
                Err("Recorder timed out. Any partial MKV was preserved; automatic restart is disabled.".into())
            }
        }
    }
    pub async fn capabilities(&mut self) -> Result<Capabilities> {
        Ok(serde_json::from_value(
            self.request("capabilities", json!({}), 25).await?,
        )?)
    }
    pub async fn status(&mut self) -> Result<Value> {
        self.request("status", json!({}), 5).await
    }
    pub async fn shutdown(&mut self) {
        if self.healthy {
            let _ = self.request("shutdown", json!({}), 30).await;
        }
        let _ = self.input.shutdown().await;
        if timeout(Duration::from_secs(3), self.child.wait())
            .await
            .is_err()
        {
            let _ = self.child.kill().await;
        }
        self.healthy = false;
    }
}
impl Drop for Recorder {
    fn drop(&mut self) {
        self.stderr.abort();
    }
}
fn validate_response(v: &Value, id: &str) -> Result<()> {
    if !v.is_object()
        || v["v"] != PROTOCOL_VERSION
        || v["id"].as_str() != Some(id)
        || !v["ok"].is_boolean()
    {
        return Err("Incompatible or out-of-order recorder response".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_bad_protocol_and_late_ack() {
        assert!(validate_response(&json!({"v":1,"id":"same","ok":true}), "same").is_ok());
        for v in [
            json!({"v":2,"id":"same","ok":true}),
            json!({"v":1,"id":"old","ok":true}),
            json!({"v":1,"id":"same","ok":1}),
        ] {
            assert!(validate_response(&v, "same").is_err());
        }
    }
}
