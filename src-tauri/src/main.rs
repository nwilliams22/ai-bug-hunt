// Release builds on Windows must not also open a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bug_finder_lib::run()
}
