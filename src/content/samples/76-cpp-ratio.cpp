#include <cstdint>
#include <optional>
std::optional<double> completion(std::int64_t done, std::int64_t total) {
    if (total == 0) return std::nullopt;
    return static_cast<double>(done / total);
}
