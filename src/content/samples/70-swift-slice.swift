/// Return at most limit elements starting at offset; both are nonnegative.
func page<T>(_ items: [T], offset: Int, limit: Int) -> ArraySlice<T> {
    precondition(offset >= 0 && limit >= 0)
    let start = min(offset, items.count)
    let remaining = items.count - start
    return items[start..<(start + min(limit, remaining))]
}
