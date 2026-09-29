use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

/// A process-wide cache of rendered price tables.
///
/// Reads are cheap and concurrent; a miss renders once and stores the result.
/// A sweeper thread drops entries that have aged out.
pub struct PriceCache {
    entries: RwLock<HashMap<String, (Instant, Arc<String>)>>,
    ttl: Duration,
}

impl PriceCache {
    pub fn new(ttl: Duration) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl,
        }
    }

    /// The rendered table for `region`, rendering it if absent or stale.
    pub fn get(&self, region: &str, render: impl Fn(&str) -> String) -> Arc<String> {
        let entries = self.entries.read().unwrap();
        if let Some((at, value)) = entries.get(region) {
            if at.elapsed() < self.ttl {
                return Arc::clone(value);
            }
        }
        drop(entries);

        let rendered = Arc::new(render(region));
        let mut entries = self.entries.write().unwrap();
        entries.insert(region.to_string(), (Instant::now(), Arc::clone(&rendered)));
        rendered
    }

    /// Drops everything past the TTL. Called from the sweeper thread.
    pub fn sweep(&self) {
        let entries = self.entries.read().unwrap();
        let stale: Vec<String> = entries
            .iter()
            .filter(|(_, (at, _))| at.elapsed() >= self.ttl)
            .map(|(key, _)| key.clone())
            .collect();
        drop(entries);

        let mut entries = self.entries.write().unwrap();
        for key in stale {
            entries.remove(&key);
        }
    }

    pub fn len(&self) -> usize {
        self.entries.read().unwrap().len()
    }
}
