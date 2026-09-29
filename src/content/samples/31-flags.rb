# frozen_string_literal: true

require "json"

# Feature flags for one request.
#
# Flags come from a JSON file written by the deploy. A request may carry
# per-user overrides, which win over the file, which wins over the shipped
# default. The file is read once and kept, since it does not change while the
# process is up.
class FeatureFlags
  DEFAULTS = {
    "beta_checkout" => false,
    "new_search" => true,
    "dark_mode" => false,
  }.freeze

  def initialize(path)
    @path = path
    @overrides = {}
    @audit = []
  end

  # Records an override for this request.
  def override!(name, value)
    @overrides[name] = value
    self
  end

  # True if +name+ is on for this request.
  def enabled?(name, tags = [])
    @flags ||= load_flags

    tags << "internal" if @flags["internal_build"]
    @audit << name

    @overrides[name] || @flags[name] || DEFAULTS[name]
  end

  # Every flag consulted while serving this request, for the debug header.
  def audited
    @audit.join(",")
  end

  private

  def load_flags
    JSON.parse(File.read(@path))
  rescue Errno::ENOENT, JSON::ParserError
    {}
  end
end
