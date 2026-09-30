/// Return a borrowed window. Empty windows and a window at the end are valid.
pub fn window<T>(items: &[T], start: usize, count: usize) -> Option<&[T]> {
    let end = start.checked_add(count)?;
    items.get(start..end)
}
