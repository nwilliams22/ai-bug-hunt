public IEnumerable<Order> GetLargeOrders(IEnumerable<Order> orders, decimal min)
{
    var large = orders.Where(o => o.Total >= min);
    _logger.LogInformation("Found {Count} large orders", large.Count());
    return large;
}
