// src/components/CreateChallenge.tsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CircleDollarSign, ChevronDown } from 'lucide-react';
import { CHALLENGE_ABI } from '../contracts/abi'; // Asegúrate que esta ruta es correcta
import { supabase } from '../lib/supabase'; // <-- La importación y el uso interno siguen igual

// Interface para los datos del equipo que necesitamos (sin cambios)
interface Team {
  id: number;
  Teams: string;
  player_ids: string[];
}

interface CreateChallengeProps {
  // IMPORTANTE: Esta prop DEBE ser el UUID del usuario ('string')
  // o null si no hay sesión. (Sin cambios en la definición)
  account: string | null;
  contractAddress: string;
}

const CreateChallenge: React.FC<CreateChallengeProps> = ({
  account, // Este sigue siendo el UUID internamente
  contractAddress,
}) => {
  // Estados principales (sin cambios)
  const [matchId, setMatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Estados para la selección de equipos (sin cambios)
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [playerIds, setPlayerIds] = useState<string[]>([]);

  // --- Cargar equipos del usuario (Lógica sin cambios, mensajes de estado modificados) ---
  useEffect(() => {
    const loadUserTeams = async () => {
      // Validación interna (sin cambios)
      const isValidUuid = account && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(account);

      if (!isValidUuid) {
        // Mensaje genérico si el ID interno no es válido
        if (account) console.warn("CreateChallenge: 'account' prop no es un UUID válido.", account);
        setUserTeams([]);
        setSelectedTeamId('');
        setPlayerIds([]);
        setLoadingTeams(false);
        // No establecer estado de error aquí, el select lo manejará con "Debes iniciar sesión"
        return;
      }

      // Si es un UUID válido, proceder a cargar
      setLoadingTeams(true);
      setStatus('Cargando tus equipos...'); // Mensaje genérico
      setUserTeams([]);
      setSelectedTeamId('');
      setPlayerIds([]);
      try {
        console.log(`CreateChallenge: Cargando equipos para usuario con ID interno: ${account}`); // Log interno
        // Lógica de Supabase sin cambios
        const { data, error, status: reqStatus } = await supabase
          .from('teams')
          .select('id, Teams, player_ids')
          .eq('user_id', account)
          .order('created_at', { ascending: false });

        console.log("CreateChallenge: Respuesta del servicio de datos:", { data, error, reqStatus }); // Log interno

        if (error) {
            console.error('CreateChallenge: Error directo del servicio de datos al cargar equipos:', error);
            throw error; // Lanzar para el catch
        }

        setUserTeams(data || []);
        setStatus(''); // Limpiar estado si carga bien
        if (data && data.length === 0) {
             console.log("CreateChallenge: No se encontraron equipos para este usuario.");
             // El mensaje en el select ya indica "No tienes equipos creados"
        }

      } catch (error: any) {
        console.error('CreateChallenge: Error en catch al cargar equipos:', error);
        // **MODIFICADO**: Mensajes de error genéricos para el usuario
         if (error?.code === 'PGRST100' || error?.message?.includes('400')) {
             setStatus(`Error 400: No se pudieron cargar tus equipos. Verifica tu conexión o permisos.`);
         } else if (error?.message?.includes("column") && error?.message?.includes("does not exist")) {
              setStatus(`Error interno del servidor al buscar equipos.`);
         } else {
            // Mensaje genérico final, sin exponer detalles del error.message
            setStatus(`Error: No se pudieron cargar tus equipos. Intenta de nuevo más tarde.`);
        }
        setUserTeams([]);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadUserTeams();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]); // Se ejecuta SOLO cuando cambia el prop 'account'

  // --- Actualizar playerIds cuando se selecciona un equipo (sin cambios) ---
  useEffect(() => {
    if (selectedTeamId) {
      const selectedTeamData = userTeams.find(team => team.id.toString() === selectedTeamId);
      if (selectedTeamData?.player_ids?.length === 6 && selectedTeamData.player_ids.every(id => typeof id === 'string' && /^\d+$/.test(id))) {
        setPlayerIds(selectedTeamData.player_ids);
        setStatus('');
        console.log("CreateChallenge: IDs cargados para equipo", selectedTeamId, ":", selectedTeamData.player_ids);
      } else if (selectedTeamData) {
         setPlayerIds([]);
         setStatus('Error: El equipo seleccionado no tiene 6 IDs de jugador válidos.');
         console.warn("CreateChallenge: IDs inválidos en equipo seleccionado:", selectedTeamData.player_ids);
      } else {
         setPlayerIds([]);
         console.warn("CreateChallenge: No se encontró el equipo con ID", selectedTeamId, "en la lista cargada.");
      }
    } else {
      setPlayerIds([]);
    }
  }, [selectedTeamId, userTeams]);

  // --- Handler para Crear Desafío (Lógica sin cambios, mensajes de estado modificados) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('');

     const isValidUuid = account && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(account);
    if (!isValidUuid) {
      // **MODIFICADO**: Mensaje genérico
      setStatus('Error: Sesión de usuario no válida o expirada.');
      return;
    }
    if (!selectedTeamId || playerIds.length !== 6) {
      setStatus("Error: Selecciona un equipo válido con 6 IDs para crear el desafío.");
      return;
    }
    const finalMatchId = (matchId && /^\d+$/.test(matchId)) ? matchId : '0';
    const numericSelectedTeamId = parseInt(selectedTeamId, 10);
    if (!window.ethereum) { setStatus('Error: Instala MetaMask.'); return; }

    setLoading(true);
    setStatus('Preparando transacción...');
    try {
      // Lógica Blockchain sin cambios
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) throw new Error("MetaMask no conectada o sin cuentas.");
      const walletAddress = accounts[0];
      console.log("Wallet conectada para firmar:", walletAddress);
      const signer = await provider.getSigner(walletAddress);

      const challengeContract = new ethers.Contract(contractAddress, CHALLENGE_ABI, signer);
      const stakeAmount = ethers.parseEther('5');
      const teamIdsBigInt = playerIds.map(id => BigInt(id));

      setStatus('Enviando transacción a la blockchain...');
      const tx = await challengeContract.createChallenge(finalMatchId, teamIdsBigInt, 0, { value: stakeAmount });

      setStatus('Esperando confirmación de la blockchain...');
      const receipt = await tx.wait(1);

      let newChallengeId = "???";
      // Lógica para obtener ID del evento (sin cambios)
      if (receipt?.logs && challengeContract.interface) {
        try {
            const challengeCreatedEvent = receipt.logs
              .map((log: any) => { try { return challengeContract.interface.parseLog(log); } catch { return null; } })
              .find((parsedLog: any) => parsedLog?.name === "ChallengeCreated");
            if (challengeCreatedEvent?.args?.[0]) {
              newChallengeId = challengeCreatedEvent.args[0].toString();
              console.log("ID del nuevo desafío obtenido del evento:", newChallengeId);
            } else { console.warn("No se encontró el evento 'ChallengeCreated' o sus argumentos en los logs."); }
        } catch (logError) { console.error("Error parseando logs para ChallengeCreated:", logError); }
      } else { console.warn("Receipt o logs no disponibles para obtener ID del desafío."); }

      if (newChallengeId !== "???" && !isNaN(numericSelectedTeamId)) {
        setStatus('Guardando información del equipo...');
        try {
          // Lógica de guardado en Supabase (sin cambios)
          const { error: linkError } = await supabase
            .from('challenge_teams')
            .insert({ challenge_id: newChallengeId, team_id: numericSelectedTeamId });

          if (linkError) {
            console.error("Error guardando relación challenge-team en el servicio de datos:", linkError);
            // **MODIFICADO**: Mensaje genérico para el usuario
            setStatus(prev => `¡Éxito en blockchain! (Advertencia: no se pudo guardar la asociación del equipo.)`);
          } else {
            console.log("Relación challenge-team guardada en el servicio de datos.");
            setStatus(`¡Éxito! Desafío #${newChallengeId} creado y equipo asociado.`);
          }
        } catch (dbError: any) {
          console.error("Excepción guardando relación en el servicio de datos:", dbError);
           // **MODIFICADO**: Mensaje genérico para el usuario
          setStatus(prev => `¡Éxito en blockchain! (Advertencia: ocurrió un error al guardar la asociación del equipo.)`);
        }
      } else {
         setStatus(`¡Éxito en blockchain! (Advertencia: No se pudo obtener ID del desafío para guardar info de equipo) Tx: ${tx.hash.substring(0,10)}...`);
         console.warn("No se guardará la relación challenge-team: newChallengeId o numericSelectedTeamId inválidos.", {newChallengeId, numericSelectedTeamId});
      }
      setSelectedTeamId(''); setPlayerIds([]); setMatchId('');
    } catch (error: any) {
      console.error('Error en handleSubmit:', error);
      const reason = error?.reason || error?.data?.message || error?.message || 'Error desconocido';
      // Mensajes de error Blockchain (sin cambios, son de MetaMask/contrato)
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') { setStatus('Error: Transacción rechazada por el usuario.'); }
      else if (error.code === -32603) {
          if (reason.includes("insufficient funds")) { setStatus('Error: Fondos insuficientes para completar la transacción.'); }
          else if (reason.includes("Must send exact stake amount")) { setStatus('Error: Debes enviar exactamente 5 S.'); }
          else { setStatus(`Error interno: ${reason}`); }
      } else { setStatus(`Error: ${reason}`); }
    } finally { setLoading(false); }
  };

  // --- JSX (Textos visibles modificados) ---
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-6">
        <CircleDollarSign className="w-6 h-6 mr-2 text-blue-500" />
        <h2 className="text-2xl font-bold">Crear Desafío</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Selector de Equipo */}
        <div className="mb-6">
          <label htmlFor="team-select" className="block text-sm font-medium text-gray-700 mb-1">
            Selecciona tu Equipo
          </label>
          <div className="relative">
             <select
               id="team-select"
               value={selectedTeamId}
               onChange={(e) => setSelectedTeamId(e.target.value)}
               disabled={loading || loadingTeams || !account || userTeams.length === 0}
               required
               className="appearance-none w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
             >
               <option value="" disabled>
                 {/* **MODIFICADO**: Texto genérico para el estado !account */}
                 {loadingTeams ? 'Cargando equipos...' : !account ? 'Debes iniciar sesión primero' : userTeams.length === 0 ? 'No tienes equipos creados' : '-- Elige un equipo --'}
               </option>
               {userTeams.map((team) => (
                 <option key={team.id} value={team.id.toString()}>
                   {team.Teams} {/* Muestra el nombre del equipo */}
                 </option>
               ))}
             </select>
             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <ChevronDown className="h-4 w-4" />
            </div>
          </div>
           {selectedTeamId && playerIds.length === 6 && (
            <div className="mt-2 text-xs text-gray-500 break-all">
              IDs cargados: {playerIds.join(', ')}
            </div>
          )}
           {!selectedTeamId && !loadingTeams && userTeams.length > 0 && account && (
                <p className="text-xs text-gray-500 mt-1">Selecciona un equipo para cargar sus IDs.</p>
            )}
            {loadingTeams && (<p className="text-xs text-blue-500 mt-1">Buscando tus equipos...</p>)}
            {!loadingTeams && userTeams.length === 0 && account && (<p className="text-xs text-orange-500 mt-1">No tienes equipos. Ve a la sección 'Crear Equipo'.</p>)}
            {/* **MODIFICADO**: Texto genérico para el estado !account */}
            {!account && (<p className="text-xs text-red-500 mt-1">Inicia sesión para ver y seleccionar tus equipos.</p>)}
        </div>

        {/* Input Match ID (Opcional) (Sin cambios visuales) */}
        <div className="mb-6">
          <label htmlFor="match-id-input" className="block text-sm font-medium text-gray-700 mb-1">
            ID de Partida Predefinida (Opcional)
          </label>
          <input
            id="match-id-input"
            type="text"
            value={matchId}
            onChange={(e) => /^\d*$/.test(e.target.value) && setMatchId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="Dejar vacío o 0 si no aplica"
            disabled={loading}
            pattern="\d*"
            title="Ingresa solo números"
          />
        </div>

        {/* Mensaje de Estado (Sin cambios en estructura, pero los textos que recibe ahora son genéricos) */}
        {status && (
          <div className={`mb-4 p-3 rounded-md text-sm ${
            status.startsWith('Error:') ? 'bg-red-100 text-red-700 border border-red-300' :
            status.startsWith('¡Éxito!') ? 'bg-green-100 text-green-700 border border-green-300' :
            'bg-blue-100 text-blue-700 border border-blue-300'
          }`}>
            {status}
          </div>
        )}

        {/* Botón Submit (Sin cambios visuales) */}
        <button
          type="submit"
          disabled={loading || !account || !selectedTeamId || playerIds.length !== 6}
          className={`w-full bg-blue-500 text-white py-3 rounded-md font-semibold transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600`}
        >
          {loading ? 'Procesando...' : 'Crear Desafío (5 S)'}
        </button>
        {/* Mensaje de ayuda si está deshabilitado (Sin cambios, "administrador" es suficientemente genérico) */}
         {(!account || !selectedTeamId || playerIds.length !== 6) && !loading && (
            <p className="text-xs text-red-600 text-center mt-2">Completa los pasos anteriores o verifica tu sesión para habilitar la creación.</p> // Ajustado levemente para ser más general
         )}
      </form>
    </div>
  );
};

export default CreateChallenge;