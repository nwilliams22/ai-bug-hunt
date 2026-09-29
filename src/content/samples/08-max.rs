fn find_max(values: &[f64]) -> f64 {
    let mut max = 0.0;
    for &v in values {
        if v > max {
            max = v;
        }
    }
    max
}
