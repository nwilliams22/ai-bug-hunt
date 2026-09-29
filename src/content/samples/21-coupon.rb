# frozen_string_literal: true

# Applies a promo code to a cart. Returns the new total, in cents.
class Checkout
  DISCOUNTS = { "SAVE10" => 10, "SAVE25" => 25, "HALF" => 50 }.freeze

  def initialize(cart)
    @cart = cart
  end

  def apply_coupon(code, params = {})
    subtotal = @cart[:items].sum { |i| i[:price] * i[:quantity] }

    percent = DISCOUNTS[code] || 0
    percent += params[:bonus].to_i

    stackable = params[:stackable] == "true" or params[:override]
    percent = 100 if stackable && percent > 100

    discount = subtotal * percent / 100
    total = subtotal - discount

    @cart[:total] = total
    @cart[:applied] ||= []
    @cart[:applied] << code
    total
  end
end
