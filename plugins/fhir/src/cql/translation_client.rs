use serde_json::Value;
use std::collections::HashMap;
use std::sync::RwLock;

pub struct CqlTranslationClient {
    base_url: String,
    cache: RwLock<HashMap<String, Value>>,
}

impl CqlTranslationClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub async fn translate(
        &self,
        _cql_text: &str,
        library_url: Option<&str>,
        library_version: Option<&str>,
    ) -> Result<Value, String> {
        let cache_key = format!(
            "{}|{}",
            library_url.unwrap_or(""),
            library_version.unwrap_or("")
        );
        {
            let cache = self.cache.read().unwrap();
            if let Some(cached) = cache.get(&cache_key) {
                return Ok(cached.clone());
            }
        }

        // HTTP client not available; users must provide pre-compiled ELM.
        Err(format!(
            "CQL translation service at {} is not available. \
             Please provide pre-compiled ELM JSON directly in the request body \
             using the 'library' field instead of CQL source text.",
            self.base_url
        ))
    }

    pub fn cache_elm(&self, library_url: &str, library_version: &str, elm: Value) {
        let cache_key = format!("{}|{}", library_url, library_version);
        let mut cache = self.cache.write().unwrap();
        cache.insert(cache_key, elm);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn base_url_trims_trailing_slash() {
        let c = CqlTranslationClient::new("http://example.com/");
        assert_eq!(c.base_url(), "http://example.com");
        let c2 = CqlTranslationClient::new("http://example.com");
        assert_eq!(c2.base_url(), "http://example.com");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn translate_uses_cache_when_pre_populated() {
        let c = CqlTranslationClient::new("http://example.com");
        c.cache_elm("urn:lib", "1.0.0", json!({"elm": "yes"}));
        let v = c
            .translate("ignored", Some("urn:lib"), Some("1.0.0"))
            .await
            .unwrap();
        assert_eq!(v["elm"], "yes");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn translate_without_cache_returns_unavailable_error() {
        let c = CqlTranslationClient::new("http://example.com");
        let err = c
            .translate("define x: 1", Some("urn:other"), Some("1.0.0"))
            .await
            .unwrap_err();
        assert!(err.contains("not available"));
    }
}
