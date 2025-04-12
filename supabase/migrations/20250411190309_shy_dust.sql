/*
  # Team Leaderboard System Schema

  1. New Tables
    - `teams` table is already defined with bigint id, we'll use that
    - New tables for team management and achievements
    - All foreign keys aligned with existing schema

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Add policies for team members

  3. Functions
    - update_team_stats(): Updates team statistics after challenge completion
*/

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id bigint REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  badge_url text NOT NULL,
  points_value integer NOT NULL DEFAULT 0
);

-- Create team_achievements table
CREATE TABLE IF NOT EXISTS team_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id bigint REFERENCES teams(id) ON DELETE CASCADE,
  achievement_id uuid REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(team_id, achievement_id)
);

-- Create challenge_history table
CREATE TABLE IF NOT EXISTS challenge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id bigint REFERENCES teams(id) ON DELETE CASCADE,
  challenge_id bigint NOT NULL,
  result text NOT NULL,
  points_earned integer DEFAULT 0,
  played_at timestamptz DEFAULT now()
);

-- Add new columns to existing teams table
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'total_victories') THEN
    ALTER TABLE teams ADD COLUMN total_victories integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'total_points') THEN
    ALTER TABLE teams ADD COLUMN total_points integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'latest_victory') THEN
    ALTER TABLE teams ADD COLUMN latest_victory timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'logo_url') THEN
    ALTER TABLE teams ADD COLUMN logo_url text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'updated_at') THEN
    ALTER TABLE teams ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public teams are viewable by everyone"
  ON teams FOR SELECT
  USING (true);

CREATE POLICY "Team members can update their team"
  ON teams FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = teams.id
      AND user_id = auth.uid()
      AND role IN ('admin', 'captain')
    )
  );

CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Team members can view team details"
  ON team_members FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM team_members WHERE team_id = team_members.team_id
    )
  );

CREATE POLICY "Team admins can manage members"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = team_members.team_id
      AND user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Create function to update team stats
CREATE OR REPLACE FUNCTION update_team_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE teams
  SET 
    total_victories = (
      SELECT COUNT(*) 
      FROM challenge_history 
      WHERE team_id = NEW.team_id 
      AND result = 'victory'
    ),
    total_points = (
      SELECT COALESCE(SUM(points_earned), 0) 
      FROM challenge_history 
      WHERE team_id = NEW.team_id
    ),
    latest_victory = (
      SELECT MAX(played_at) 
      FROM challenge_history 
      WHERE team_id = NEW.team_id 
      AND result = 'victory'
    ),
    updated_at = now()
  WHERE id = NEW.team_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating team stats
CREATE TRIGGER update_team_stats_trigger
AFTER INSERT OR UPDATE ON challenge_history
FOR EACH ROW
EXECUTE FUNCTION update_team_stats();

-- Insert default achievements
INSERT INTO achievements (name, description, badge_url, points_value) VALUES
  ('First Victory', 'Win your first challenge', '/badges/first-victory.svg', 100),
  ('Perfect Month', 'Win all challenges in a month', '/badges/perfect-month.svg', 500),
  ('Rising Star', 'Win 5 challenges in a row', '/badges/rising-star.svg', 300),
  ('Elite Team', 'Accumulate 1000 points', '/badges/elite-team.svg', 1000),
  ('Veteran Squad', 'Complete 50 challenges', '/badges/veteran-squad.svg', 750)
ON CONFLICT (name) DO NOTHING;