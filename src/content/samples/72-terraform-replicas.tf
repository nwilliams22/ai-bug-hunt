variable "environment" { type = string }
variable "replicas" { type = number }
variable "subnet_ids" { type = list(string) }
variable "launch_template_id" { type = string }
resource "aws_autoscaling_group" "api" {
  name                 = "api-${var.environment}"
  min_size             = 1
  max_size             = var.replicas
  desired_capacity     = var.replicas
  health_check_type    = "EC2"
  vpc_zone_identifier  = var.subnet_ids
  launch_template {
    id      = var.launch_template_id
    version = "$Latest"
  }
}
