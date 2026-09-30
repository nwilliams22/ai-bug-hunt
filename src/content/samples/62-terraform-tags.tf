variable "environment" { type = string }
variable "team" { type = string }
locals {
  required_tags = { Environment = var.environment, Team = var.team }
}
resource "aws_s3_bucket" "archive" {
  bucket = "archive-${var.environment}"
  tags   = merge(local.required_tags, { Purpose = "archive" })
}
