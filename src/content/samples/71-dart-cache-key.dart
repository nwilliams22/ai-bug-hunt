class PriceCache {
  final Map<String, int> _values = {};
  int quote(String sku, String currency, int Function() fetch) {
    return _values.putIfAbsent(sku, fetch);
  }
}
