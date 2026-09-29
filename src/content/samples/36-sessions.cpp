#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

// The registry of connected sessions, shared by the accept loop and every
// worker thread. Lookups go through the id index; the vector keeps insertion
// order for the admin page.
class SessionRegistry {
 public:
  struct Session {
    std::string id;
    std::string user;
    int pending = 0;
  };

  // Registers a session and returns a handle the caller updates in place.
  Session& Add(const std::string& id, const std::string& user) {
    std::lock_guard<std::mutex> guard(mu_);
    sessions_.push_back({id, user, 0});
    index_[id] = sessions_.size() - 1;
    return sessions_.back();
  }

  // The session for id, or nullptr once it has gone away.
  Session* Find(const std::string& id) {
    auto it = index_.find(id);
    if (it == index_.end()) return nullptr;
    return &sessions_[it->second];
  }

  // Drops a session when its socket closes.
  void Remove(const std::string& id) {
    std::lock_guard<std::mutex> guard(mu_);
    auto it = index_.find(id);
    if (it == index_.end()) return;
    sessions_.erase(sessions_.begin() + it->second);
    index_.erase(it);
  }

  // Rows for the admin page, in the order the sessions connected.
  const std::vector<Session>& All() const { return sessions_; }

  size_t Count() const { return sessions_.size(); }

 private:
  std::mutex mu_;
  std::vector<Session> sessions_;
  std::unordered_map<std::string, size_t> index_;
};
