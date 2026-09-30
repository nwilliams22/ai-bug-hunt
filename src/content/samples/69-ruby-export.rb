def export_rows(rows, io)
  rows.each do |row|
    fields = [row.fetch(:id), row.fetch(:label), row.fetch(:amount_cents)]
    io.puts fields.join(',')
  end
end
