mod api;
mod aggregate;
mod cli;
mod models;
mod normalize;
mod render;

use clap::Parser;
use cli::Args;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    
    let client = api::HevyClient::new(args.api_key);
    println!("Fetching workouts...");
    let workouts = client.fetch_all_workouts().await?;
    println!("Found {} workouts", workouts.len());
    
    let daily_volumes = aggregate::aggregate_daily_volume(&workouts);

    render::render_graph(&daily_volumes, args.weeks, args.ascii);
    
    Ok(())
}
