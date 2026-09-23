// SPDX-License-Identifier: GPL-2.0-or-later
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")] Message(String),
    #[error("Local database operation failed: {0}")] Database(#[from] rusqlite::Error),
    #[error("Local file operation failed: {0}")] Io(#[from] std::io::Error),
    #[error("Invalid local data: {0}")] Json(#[from] serde_json::Error),
    #[error("Operation cancelled")] Cancelled,
    #[error("Paused to protect recording performance")] Paused,
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<String> for Error { fn from(value: String) -> Self { Self::Message(value) } }
impl From<&str> for Error { fn from(value: &str) -> Self { Self::Message(value.into()) } }
