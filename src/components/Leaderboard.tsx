import React, { useEffect, useState } from 'react';
import { Trophy, Users, Award, Clock } from 'lucide-react';
import { supabase, Team } from '../lib/supabase';

interface LeaderboardProps {
  sortBy?: 'victories' | 'points' | 'recent' | 'members';
}

const Leaderboard: React.FC<LeaderboardProps> = ({ sortBy = 'points' }) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        setLoading(true);
        let query = supabase
          .from('teams')
          .select(`
            *,
            team_members(count),
            team_achievements(
              achievements(name, badge_url)
            )
          `);

        switch (sortBy) {
          case 'victories':
            query = query.order('total_victories', { ascending: false });
            break;
          case 'points':
            query = query.order('total_points', { ascending: false });
            break;
          case 'recent':
            query = query.order('latest_victory', { ascending: false });
            break;
          case 'members':
            query = query.order('team_members(count)', { ascending: false });
            break;
        }

        const { data, error } = await query.limit(50);

        if (error) throw error;
        setTeams(data || []);
      } catch (err) {
        console.error('Error fetching teams:', err);
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();

    // Subscribe to realtime updates
    const subscription = supabase
      .channel('teams_channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'teams'
      }, (payload) => {
        // Update the teams list when changes occur
        setTeams(current => {
          const updated = [...current];
          const index = updated.findIndex(team => team.id === payload.new.id);
          if (index !== -1) {
            updated[index] = payload.new as Team;
          } else {
            updated.push(payload.new as Team);
          }
          return updated;
        });
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sortBy]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Team Leaderboard</h2>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.href = '?sort=victories'}
            className={`p-2 rounded ${sortBy === 'victories' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            title="Sort by Victories"
          >
            <Trophy className="w-5 h-5" />
          </button>
          <button
            onClick={() => window.location.href = '?sort=points'}
            className={`p-2 rounded ${sortBy === 'points' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            title="Sort by Points"
          >
            <Award className="w-5 h-5" />
          </button>
          <button
            onClick={() => window.location.href = '?sort=recent'}
            className={`p-2 rounded ${sortBy === 'recent' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            title="Sort by Recent Activity"
          >
            <Clock className="w-5 h-5" />
          </button>
          <button
            onClick={() => window.location.href = '?sort=members'}
            className={`p-2 rounded ${sortBy === 'members' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            title="Sort by Team Size"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Team</th>
              <th className="px-4 py-3 text-center">Victories</th>
              <th className="px-4 py-3 text-center">Points</th>
              <th className="px-4 py-3 text-center">Latest Victory</th>
              <th className="px-4 py-3 text-center">Achievements</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, index) => (
              <tr
                key={team.id}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  {index + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    {team.logo_url && (
                      <img
                        src={team.logo_url}
                        alt={`${team.name} logo`}
                        className="w-8 h-8 rounded-full mr-3"
                      />
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">{team.name}</div>
                      <div className="text-sm text-gray-500">
                        {team.team_members?.count || 0} members
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center font-semibold">
                  {team.total_victories}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                    {team.total_points} pts
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">
                  {team.latest_victory
                    ? new Date(team.latest_victory).toLocaleDateString()
                    : 'No victories yet'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    {team.team_achievements?.map((achievement, i) => (
                      <img
                        key={i}
                        src={achievement.achievements?.badge_url}
                        alt={achievement.achievements?.name}
                        className="w-6 h-6"
                        title={achievement.achievements?.name}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Leaderboard;