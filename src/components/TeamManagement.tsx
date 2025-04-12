// src/components/TeamManagement.tsx
import React, { useState, useEffect } from 'react';
import { Users, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Tu cliente Supabase inicializado
import { Auth } from '@supabase/auth-ui-react'; // Componente Auth UI
import { ThemeSupa } from '@supabase/auth-ui-shared'; // Tema (opcional)
import { Session } from '@supabase/supabase-js'; // Tipo Session

interface TeamManagementProps {
  onTeamCreated?: (teamId: number) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ onTeamCreated }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [teamName, setTeamName] = useState('');
  const [playerIds, setPlayerIds] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // --- Efecto para manejar la sesión de autenticación ---
  useEffect(() => {
    setLoadingAuth(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      console.log("Initial session:", session);
      setLoadingAuth(false);
    }).catch(error => {
      console.error("Error getting initial session:", error);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      console.log("Auth state changed, new session:", session);
      if (session) {
          setStatus('');
      }
      if (loadingAuth) setLoadingAuth(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // --- Handler para cambiar IDs de jugador ---
  const handlePlayerIdChange = (index: number, value: string) => {
    if (/^\d*$/.test(value)) {
      const newPlayerIds = [...playerIds];
      newPlayerIds[index] = value;
      setPlayerIds(newPlayerIds);
    }
  };

  // --- Handler para Crear Equipo ---
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('');

    if (!session || !session.user || !session.user.id) {
      setStatus('Error: Debes iniciar sesión para crear un equipo.');
      return;
    }

    const userUuid = session.user.id;

    if (!teamName.trim()) {
      setStatus('Error: Por favor, ingresa un nombre para el equipo.');
      return;
    }
    if (playerIds.some(id => !id || !/^\d+$/.test(id)) || playerIds.length !== 6) {
      setStatus('Error: Por favor, ingresa 6 IDs de jugador numéricos válidos.');
      return;
    }

    setLoading(true);
    try {
      // ----- CORRECCIÓN FINAL AQUÍ -----
      // Usamos el nombre de columna EXACTO de tu tabla: 'Teams'
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert([
          {
            Teams: teamName.trim(),     // <-- ¡¡CORREGIDO!! Usa 'Teams'
            player_ids: playerIds,
            user_id: userUuid
            // OJO: Tu tabla también tiene una columna 'id_team' (numeric).
            // Si necesitas insertar algo ahí también, agrégalo aquí.
            // Ejemplo: id_team: ALGUN_VALOR_NUMERICO,
          }
        ])
        .select('id') // Seleccionamos el 'id' auto-generado de Supabase
        .single();
      // ---------------------------------

      if (teamError) {
        console.error("Supabase team insert error:", teamError);
        if (teamError.message.includes('violates row-level security policy')) {
            throw new Error(`Error de Permiso: No se pudo crear el equipo. Verifica las políticas RLS.`);
        } else if (teamError.message.includes("Could not find the column")) {
             // Este error ya no debería ocurrir si 'Teams' es correcto
             throw new Error(`Error: La columna '${teamError.message.split("'")[1]}' no existe. Revisa el código y Supabase.`);
        } else if (teamError.message.includes('duplicate key value violates unique constraint')) {
             throw new Error(`Error: Ya existe un equipo con ese nombre o configuración similar.`);
        }
        throw new Error(`Error al crear equipo: ${teamError.message}`);
      }

      if (!teamData || typeof teamData.id !== 'number') {
         throw new Error("No se pudo obtener el ID numérico (columna 'id') del equipo creado desde Supabase.");
      }

      const newTeamId = teamData.id; // Este es el ID de la fila, no id_team
      console.log(`Equipo creado por usuario ${userUuid.substring(0,8)}... con ID de fila: ${newTeamId}`);

      setStatus(`¡Éxito! Equipo "${teamName.trim()}" creado.`);
      setTeamName('');
      setPlayerIds(Array(6).fill(''));

      if (onTeamCreated) {
        onTeamCreated(newTeamId); // Pasamos el ID de la fila creada
      }

    } catch (error: any) {
      console.error('Error general en handleCreateTeam:', error);
      setStatus(error.message || 'Ocurrió un error desconocido al crear el equipo.');
    } finally {
      setLoading(false);
    }
  };

  // --- Renderizado Condicional ---
   if (loadingAuth) {
    return (
        <div className="bg-white rounded-lg shadow p-6 text-center">
            <p>Cargando sesión...</p>
        </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
         <h2 className="text-2xl font-bold text-center mb-6">Iniciar Sesión / Registrarse</h2>
         <p className="text-center text-gray-600 mb-4">Necesitas una cuenta para crear equipos.</p>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]} // Solo Email/Contraseña
          theme="dark"
        />
      </div>
    );
  }

  // Si HAY sesión, muestra el formulario
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Users className="w-6 h-6 mr-2 text-blue-500" />
            <h2 className="text-2xl font-bold">Crear Equipo</h2>
          </div>
          <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-red-600 hover:text-red-800"
              title="Cerrar sesión"
            >
              Salir ({session.user.email?.split('@')[0] || 'Usuario'})
            </button>
      </div>

      <form onSubmit={handleCreateTeam}>
         <div className="mb-4">
          <label htmlFor="team-name-input" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del Equipo (Columna: Teams)
          </label>
          <input
            id="team-name-input"
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Ej: Los Leones"
            required
            disabled={loading}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {playerIds.map((id, index) => (
            <div key={index}>
              <label htmlFor={`player-id-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                ID Jugador {index + 1}
              </label>
              <input
                id={`player-id-${index}`}
                type="text"
                value={id}
                onChange={(e) => handlePlayerIdChange(index, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="ID Numérico"
                required
                disabled={loading}
                pattern="\d+"
                title="Ingresa solo números"
              />
            </div>
          ))}
        </div>

        {status && (
          <div className={`mb-4 p-3 rounded-md text-sm ${
            status.startsWith('Error:') ? 'bg-red-100 text-red-700 border border-red-300' :
            status.startsWith('¡Éxito!') ? 'bg-green-100 text-green-700 border border-green-300' :
            'bg-blue-100 text-blue-700 border border-blue-300'
          }`}>
            {status}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Plus className="w-5 h-5 mr-2" />
          {loading ? 'Creando...' : 'Crear Equipo'}
        </button>
      </form>
    </div>
  );
};

export default TeamManagement;