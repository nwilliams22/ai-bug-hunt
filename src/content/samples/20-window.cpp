#include <algorithm>
#include <numeric>
#include <span>
#include <string>
#include <vector>

struct Window {
    std::span<const double> samples;  // a view into the caller's readings
    double mean;
    std::string label;
};

// Returns the highest-scoring run of `width` consecutive samples.
Window best_window(const std::vector<double>& data, int width) {
    Window best{};
    double best_sum = 0.0;

    for (size_t i = 0; i + width <= data.size(); ++i) {
        std::span<const double> w(data.data() + i, width);
        double sum = std::accumulate(w.begin(), w.end(), 0);
        if (sum > best_sum) {
            best_sum = sum;
            best = Window{w, sum / width, "window@" + std::to_string(i)};
        }
    }
    return best;
}

// Returns the three best windows, each shifted one sample later than the last.
std::vector<Window> top_windows(std::vector<double> readings, int width) {
    std::vector<Window> out;
    for (int pass = 0; pass < 3; ++pass) {
        out.push_back(best_window(readings, width));
        readings.erase(readings.begin());
    }
    return out;
}
