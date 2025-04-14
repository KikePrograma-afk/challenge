// src/components/TeamManagement.tsx
import React, { useState } from 'react'; // Removido useEffect
import { Users, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Tu cliente Supabase inicializado
import { Auth } from '@supabase/auth-ui-react'; // Componente Auth UI
import { ThemeSupa } from '@supabase/auth-ui-shared'; // Tema (opcional)
import { Session } from '@supabase/supabase-js'; // Tipo Session

interface TeamManagementProps {
  session: Session | null; // <-- RECIBE la sesión como prop
  onTeamCreated?: (teamId: number) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ session, onTeamCreated }) => {
  // Estados locales para el formulario (sin cambios)
  const [teamName, setTeamName] = useState('');
  const [playerIds, setPlayerIds] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Handler para cambiar IDs de jugador (sin cambios)
  const handlePlayerIdChange = (index: number, value: string) => {
    if (/^\d*$/.test(value)) { // Permite solo números o vacío
      const newPlayerIds = [...playerIds];
      newPlayerIds[index] = value;
      setPlayerIds(newPlayerIds);
    }
  };

  // Handler para Crear Equipo (Usa la prop 'session') (sin cambios)
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
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert([{ Teams: teamName.trim(), player_ids: playerIds, user_id: userUuid }])
        .select('id')
        .single();

      if (teamError) {
        console.error("Supabase team insert error:", teamError);
        if (teamError.message.includes('violates row-level security policy')) {
            throw new Error(`Error de Permiso: No se pudo crear el equipo. Verifica las políticas RLS.`);
        } else if (teamError.message.includes("Could not find the column")) {
             throw new Error(`Error: La columna '${teamError.message.split("'")[1]}' no existe. Revisa el código y Supabase.`);
        } else if (teamError.message.includes('duplicate key value violates unique constraint')) {
             throw new Error(`Error: Ya existe un equipo con ese nombre o configuración similar.`);
        }
        throw new Error(`Error al crear equipo: ${teamError.message}`);
      }
      if (!teamData || typeof teamData.id !== 'number') {
         throw new Error("No se pudo obtener el ID numérico (columna 'id') del equipo creado desde Supabase.");
      }

      const newTeamId = teamData.id;
      console.log(`Equipo creado por usuario ${userUuid.substring(0,8)}... con ID de fila: ${newTeamId}`);
      setStatus(`¡Éxito! Equipo "${teamName.trim()}" creado.`);
      setTeamName('');
      setPlayerIds(Array(6).fill(''));
      if (onTeamCreated) {
        onTeamCreated(newTeamId);
      }
    } catch (error: any) {
      console.error('Error general en handleCreateTeam:', error);
      setStatus(error.message || 'Ocurrió un error desconocido al crear el equipo.');
    } finally {
      setLoading(false);
    }
  };

  // --- Renderizado Condicional ---

  // Muestra el Login si la prop 'session' es null
  if (!session) {
    return (
      <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
         <h2 className="text-2xl font-bold text-center mb-6">Iniciar Sesión / Registrarse</h2>
         <p className="text-center text-gray-600 mb-4">Necesitas una cuenta para gestionar tu equipo.</p>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]} // Solo Email/Contraseña
          theme="dark"   // Puedes cambiar a 'light' si prefieres
          localization={{ // Opcional: traducir botones
            variables: {
              // === CORRECCIÓN AQUÍ: Removidos los '...' incorrectos ===
              sign_in: { email_label: 'Tu correo electrónico', password_label: 'Tu contraseña', button_label: 'Iniciar sesión' /* Removido ... */ },
              sign_up: { email_label: 'Tu correo electrónico', password_label: 'Tu contraseña', button_label: 'Registrarse', link_text: '¿No tienes cuenta? Regístrate' /* Removido ... */ },
              forgotten_password: { email_label: 'Tu correo electrónico', button_label: 'Enviar instrucciones', link_text: '¿Olvidaste tu contraseña?' /* Removido ... */ },
              // =======================================================
            },
          }}
        />
      </div>
    );
  }

  // Si HAY sesión (la prop no es null), muestra el formulario
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Users className="w-6 h-6 mr-2 text-blue-500" />
            <h2 className="text-2xl font-bold">Gestionar Equipo</h2>
          </div>
          <button
              onClick={() => supabase.auth.signOut()} // El signOut lo detectará App.tsx
              className="text-sm text-red-600 hover:text-red-800"
              title="Cerrar sesión"
            >
              Salir ({session.user.email?.split('@')[0] || 'Usuario'})
            </button>
      </div>

      {/* Formulario para crear equipo */}
      <form onSubmit={handleCreateTeam}>
         {/* Input nombre equipo */}
         <div className="mb-4">
           <label htmlFor="team-name-input" className="block text-sm font-medium text-gray-700 mb-1">
             Nombre del Equipo
           </label>
           <input
             id="team-name-input" type="text" value={teamName}
             onChange={(e) => setTeamName(e.target.value)}
             className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
             placeholder="Ej: Los Leones" required disabled={loading}
           />
         </div>
         {/* Inputs IDs jugador */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
           {playerIds.map((id, index) => (
             <div key={index}>
               <label htmlFor={`player-id-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                 ID Jugador {index + 1}
               </label>
               <input
                 id={`player-id-${index}`} type="text" value={id}
                 onChange={(e) => handlePlayerIdChange(index, e.target.value)}
                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                 placeholder="ID Numérico" required disabled={loading} pattern="\d+" title="Ingresa solo números"
               />
             </div>
           ))}
         </div>
         {/* Status message */}
         {status && (
           <div className={`mb-4 p-3 rounded-md text-sm ${
             status.startsWith('Error:') ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-green-100 text-green-700 border border-green-300'
           }`}>
             {status}
           </div>
         )}
         {/* Botón crear */}
         <button type="submit" disabled={loading}
           className={`w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
         >
           <Plus className="w-5 h-5 mr-2" />
           {loading ? 'Guardando...' : 'Crear/Actualizar Equipo'}
         </button>
       </form>
    </div>
  );
};

export default TeamManagement;