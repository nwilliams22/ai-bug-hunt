class Quote {
  final int cents;
  final String currency;
  Quote(this.cents, this.currency);
  /// Decode a partner quote whose amount is in major currency units.
  factory Quote.fromJson(Map<String, dynamic> json) {
    final amount = (json['amount'] as num).toDouble();
    return Quote((amount * 100).round(), json['currency'] as String);
  }
}
