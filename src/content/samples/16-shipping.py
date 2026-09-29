def shipping_cost(order):
    """
    Shipping rules:
      - orders over $100 ship free
      - international orders cost $25
      - orders over 20kg cost $15
      - everything else costs $5
    """
    if order.total > 100:
        return 0
    if order.is_international:
        return 25
    if order.weight_kg > 20:
        return 15
    return 5
