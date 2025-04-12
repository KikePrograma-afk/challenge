// src/components/ChallengeList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { List, Info, ChevronDown } from 'lucide-react';
import { CHALLENGE_ABI } from '../contracts/abi';
import { supabase } from '../lib/supabase';

// Interface para datos del desafío
interface ChallengeDisplay {
  id: string;
  captain1: string;
  challengingTeam: string[]; // IDs del equipo que creó (del contrato)
  creationTime: number;
  stakeAmount: string;
  teamName?: string; // Nombre del equipo que creó (a buscar en Supabase)
}

// Interface para equipos del usuario (para aceptar)
interface UserTeam {
    id: number;
    Teams: string;
    player_ids: string[];
}

// Props actualizadas
interface ChallengeListProps {
  walletAddress: string | null;
  supabaseUuid: string | null;
  contractAddress: string;
}

// --- Helper para comparar arrays de IDs (debe ser comparación exacta en orden) ---
// Asegúrate que los IDs se guardan y leen en el mismo orden
const arePlayerIdArraysEqual = (arr1: string[] | undefined | null, arr2: string[] | undefined | null): boolean => {
    if (!arr1 || !arr2 || arr1.length !== 6 || arr2.length !== 6) {
        return false;
    }
    for (let i = 0; i < 6; i++) {
        const el1 = arr1[i]?.toString().trim(); // Limpiar y asegurar string
        const el2 = arr2[i]?.toString().trim(); // Limpiar y asegurar string
        if (el1 === undefined || el2 === undefined || el1 !== el2) {
            return false;
        }
    }
    return true;
};
// -----------------------------------------------------------------------------


const ChallengeList: React.FC<ChallengeListProps> = ({
  walletAddress,
  supabaseUuid,
  contractAddress,
}) => {
  const [challenges, setChallenges] = useState<ChallengeDisplay[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [userTeams, setUserTeams] = useState<UserTeam[]>([]);
  const [loadingUserTeams, setLoadingUserTeams] = useState(false);
  const [selectedTeamIdPerChallenge, setSelectedTeamIdPerChallenge] = useState<{ [challengeId: string]: string }>({});
  const [acceptingChallengeId, setAcceptingChallengeId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // --- Función para cargar desafíos y buscar nombres por IDs ---
  const loadChallenges = useCallback(async () => {
    setLoadingChallenges(true);
    setStatusMessage('Cargando desafíos...');
    setErrorMessage('');
    setChallenges([]);

    if (!window.ethereum || !contractAddress) { /* ... manejo error ... */ return; }

    try {
      // 1. OBTENER DESAFÍOS ABIERTOS DEL CONTRATO
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contractReader = new ethers.Contract(contractAddress, CHALLENGE_ABI, provider);
      let count = 0;
      try { count = Number(await contractReader.challengeCounter()); }
      catch (counterError) { throw new Error("No se pudo obtener el contador."); }

      if (count === 0) { /* ... manejo no hay desafíos ... */ return; }

      const challengePromises = [];
      for (let i = count; i >= 1; i--) {
        challengePromises.push(
          contractReader.getChallenge(i)
            .then((d: any) => d.status === 0n ? ({
              id: i.toString(),
              captain1: d.captain1,
              challengingTeam: d.challengingTeam.map((id: bigint) => id.toString()), // IDs del creador
              creationTime: Number(d.creationTime),
              stakeAmount: ethers.formatEther(d.amountStaked)
            }) : null)
            .catch(err => { console.warn(`Error cargando desafío ${i}:`, err); return null; })
        );
      }
      const contractResults = await Promise.all(challengePromises);
      const openChallengesFromContract = contractResults.filter((c): c is Omit<ChallengeDisplay, 'teamName'> => c !== null);

      if (openChallengesFromContract.length === 0) { /* ... manejo no hay desafíos abiertos ... */ return; }

      // 2. BUSCAR NOMBRE DEL EQUIPO CREADOR POR COINCIDENCIA DE IDS
      setStatusMessage(`Buscando nombres de equipos desafiantes por IDs...`);
      let finalChallenges: ChallengeDisplay[] = [];

      try {
        // Leer TODOS los equipos de Supabase para comparar
        const { data: allTeams, error: teamsError } = await supabase
          .from('teams')
          .select('id, Teams, player_ids'); // Necesitamos los IDs

        if (teamsError) {
            // Si falla leer TODOS los equipos, no podemos buscar nombres
            console.error("Error crítico leyendo TODOS los equipos de Supabase:", teamsError);
            setErrorMessage("Advertencia: No se pudo buscar nombres de equipos desafiantes (error DB).");
            // Continuar mostrando desafíos sin nombres
            finalChallenges = openChallengesFromContract.map(c => ({ ...c, teamName: undefined }));

        } else {
            // Si la lectura de equipos fue exitosa (aunque esté vacía)
            const teamsFromSupabase = allTeams || [];
            console.log(`DEBUG: Se leyeron ${teamsFromSupabase.length} equipos de Supabase para comparar.`);

            // Mapear desafíos y buscar coincidencia de IDs
            finalChallenges = openChallengesFromContract.map(challenge => {
                const matchingTeam = teamsFromSupabase.find(team =>
                    arePlayerIdArraysEqual(challenge.challengingTeam, team.player_ids)
                );
                // Log para depuración
                if (matchingTeam) {
                    console.log(`DEBUG: Coincidencia IDs encontrada para desafío ${challenge.id}! Equipo: ${matchingTeam.Teams}`);
                }
                return {
                    ...challenge,
                    teamName: matchingTeam?.Teams // Asignar nombre si se encontró
                };
            });

             // Si después de buscar, algunos siguen sin nombre, mostrar advertencia genérica
            if (finalChallenges.some(c => !c.teamName)) {
                // Solo mostrar advertencia si HUBO desafíos pero no se encontraron TODOS los nombres
                 if (finalChallenges.length > 0) {
                    setErrorMessage("Advertencia: No se encontraron nombres para algunos equipos desafiantes.");
                 }
                 // Si no hubo error crítico, limpiar status message
                 setStatusMessage('');
            } else {
                 setStatusMessage(''); // Todos los nombres encontrados
            }

        }

      } catch (dbError: any) {
          // Captura errores inesperados durante el proceso de comparación
          console.error("Error inesperado durante la búsqueda de nombres por IDs:", dbError);
          setErrorMessage("Error al procesar nombres de equipos.");
          finalChallenges = openChallengesFromContract.map(c => ({ ...c, teamName: undefined })); // Fallback
      }


      setChallenges(finalChallenges); // Actualizar estado

    } catch (error: any) {
      console.error('Error general en loadChallenges:', error);
      setErrorMessage(`Error al cargar: ${error.message || 'Error desconocido'}`);
      setChallenges([]);
    } finally {
      setLoadingChallenges(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress]);

  useEffect(() => { loadChallenges(); }, [loadChallenges]);

  // --- Cargar equipos del usuario (para aceptar) ---
  useEffect(() => {
    const loadUserTeams = async () => {
      if (!supabaseUuid) { setUserTeams([]); return; }
      setLoadingUserTeams(true);
      // No limpiar errorMessage aquí para no ocultar errores de carga de desafíos
      try {
        const { data, error } = await supabase
          .from('teams').select('id, Teams, player_ids').eq('user_id', supabaseUuid).order('created_at', { ascending: false });
        if (error) throw error;
        setUserTeams(data || []);
      } catch (error: any) {
        console.error("Error cargando equipos del usuario:", error);
        // Usar errorMessage para errores que afectan al usuario
        setErrorMessage("Error al cargar tus equipos para aceptar.");
        setUserTeams([]);
      } finally { setLoadingUserTeams(false); }
    };
    loadUserTeams();
  }, [supabaseUuid]);

  // --- Función para aceptar desafío (lógica blockchain sin cambios) ---
  const handleAcceptChallenge = async (challengeId: string) => {
    setStatusMessage(''); setErrorMessage('');
    const selectedTeamId = selectedTeamIdPerChallenge[challengeId];
    if (!window.ethereum) { setErrorMessage('Error: Instala MetaMask.'); return; }
    if (!walletAddress) { setErrorMessage('Error: Conecta tu wallet.'); return; }
    if (!selectedTeamId) { setErrorMessage(`Error: Selecciona un equipo para aceptar.`); return; }

    const teamToAcceptData = userTeams.find(team => team.id.toString() === selectedTeamId);
    if (!teamToAcceptData || teamToAcceptData.player_ids?.length !== 6 || teamToAcceptData.player_ids.some(id => !id || !/^\d+$/.test(id))) {
        setErrorMessage(`Error: El equipo '${teamToAcceptData?.Teams || selectedTeamId}' no es válido.`); return; }

    const challengeToAccept = challenges.find(c => c.id === challengeId);
    if (!challengeToAccept) { setErrorMessage('Error: Desafío no encontrado.'); return;}
    if (walletAddress.toLowerCase() === challengeToAccept.captain1.toLowerCase()) { setErrorMessage("Error: No puedes aceptar tu propio desafío."); return; }

    setAcceptingChallengeId(challengeId);
    setStatusMessage(`Aceptando desafío #${challengeId} con equipo ${teamToAcceptData.Teams}...`);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner(walletAddress);
      const challengeContract = new ethers.Contract(contractAddress, CHALLENGE_ABI, signer);
      const stakeAmount = ethers.parseEther(challengeToAccept.stakeAmount || '5');
      const teamIdsBigInt = teamToAcceptData.player_ids.map(id => BigInt(id));
      const tx = await challengeContract.acceptChallenge(challengeId, teamIdsBigInt, { value: stakeAmount });
      setStatusMessage(`Esperando confirmación para aceptar #${challengeId}...`);
      await tx.wait(1);
      setStatusMessage(`¡Éxito! Desafío #${challengeId} aceptado.`);
      setSelectedTeamIdPerChallenge(prev => { const newState = {...prev}; delete newState[challengeId]; return newState; });
      loadChallenges(); // Recargar lista
    } catch (error: any) {
      console.error('Error accepting challenge:', error);
      const reason = error?.reason || error?.data?.message || error?.message || 'Ocurrió un error desconocido.';
       if (error.code === 4001 || error.code === 'ACTION_REJECTED') { setErrorMessage('Error: Transacción rechazada.'); }
       else if (reason.includes("Must send exact stake amount")) { setErrorMessage(`Error: Debes enviar exactamente ${challengeToAccept.stakeAmount || '5'} S.`); }
       else if (reason.includes("Challenge not in Created state")) { setErrorMessage(`Error: El desafío #${challengeId} ya no está abierto.`); loadChallenges(); }
       else if (reason.includes("Creator cannot accept own challenge")) { setErrorMessage(`Error: No puedes aceptar tu propio desafío.`); }
       else { setErrorMessage(`Error al aceptar: ${reason}`); }
    } finally {
      setAcceptingChallengeId(null);
    }
  };

  // --- Handler para el SELECT ---
  const handleTeamSelectionChange = (challengeId: string, teamId: string) => {
     setSelectedTeamIdPerChallenge(prev => ({ ...prev, [challengeId]: teamId }));
     setErrorMessage('');
  };

  // --- Renderizado JSX (sin cambios respecto a la versión anterior) ---
  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
        {/* ... (Igual que antes: título, mensajes, carga, lista de desafíos) ... */}
        {/* ... (El JSX mostrará challenge.teamName si se encuentra, o "(Nombre no disponible)" si es undefined) ... */}
        {/* ... (El selector <select> para aceptar usa `userTeams` y `selectedTeamIdPerChallenge`) ... */}

      <div className="flex items-center mb-6">
        <List className="w-6 h-6 mr-2 text-blue-500" />
        <h2 className="text-2xl font-bold">Desafíos Abiertos</h2>
      </div>

       {statusMessage && ( <div className="mb-4 p-3 rounded-md text-sm bg-blue-100 text-blue-700 border border-blue-300">{statusMessage}</div> )}
       {errorMessage && ( <div className="mb-4 p-3 rounded-md text-sm bg-red-100 text-red-700 border border-red-300">{errorMessage}</div> )}

      {(loadingChallenges || (loadingUserTeams && !challenges.length)) && ( <div className="text-center py-8 text-gray-500">Cargando...</div> )} {/* Ajuste en lógica de carga */}
      {!loadingChallenges && challenges.length === 0 && !errorMessage && ( <p className="text-gray-500 text-center py-4">No se encontraron desafíos abiertos.</p> )}

      {!loadingChallenges && challenges.length > 0 && (
        <div className="space-y-6">
          {challenges.map(challenge => (
            <div key={challenge.id} className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between items-start mb-3 pb-2 border-b">
                  <div className='mb-2 sm:mb-0'>
                    <h3 className="text-xl font-semibold text-gray-800">Desafío <span className="text-blue-600">#{challenge.id}</span></h3>
                    <p className="text-xs text-gray-500 mt-1"> Creador: <span className="font-mono break-all">{challenge.captain1}</span> </p>
                    <p className="text-xs text-gray-400"> Creado: {new Date(challenge.creationTime * 1000).toLocaleString()} </p>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                       <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold tracking-wide inline-block mb-1"> ABIERTO </span>
                       <p className="text-sm font-medium text-gray-700"> Apuesta: {challenge.stakeAmount} S </p>
                  </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                <div className="border-r-0 lg:border-r lg:pr-6 border-gray-200">
                   <h4 className="text-base font-semibold text-gray-700 mb-1">Equipo Desafiante</h4>
                    {challenge.teamName ? ( <p className="text-lg font-medium text-blue-700 truncate" title={challenge.teamName}>{challenge.teamName}</p> )
                     : ( <p className="text-sm text-gray-500 italic flex items-center"><Info size={14} className="mr-1 text-orange-400"/> (Nombre no disponible)</p> )}
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-600 list-none -ml-1 inline-block">Ver IDs</summary>
                      <ul className="pl-4 list-disc list-inside mt-1 space-y-0.5 font-mono text-gray-600">
                        {challenge.challengingTeam.map((id, index) => ( <li key={index}>{id || '-'}</li> ))}
                      </ul>
                    </details>
                </div>
                {walletAddress && walletAddress.toLowerCase() !== challenge.captain1.toLowerCase() ? (
                    <div>
                        <h4 className="text-base font-semibold text-gray-700 mb-2">Aceptar con tu Equipo</h4>
                        <div className="relative mb-3">
                            <select
                                id={`team-select-accept-${challenge.id}`}
                                value={selectedTeamIdPerChallenge[challenge.id] || ''}
                                onChange={(e) => handleTeamSelectionChange(challenge.id, e.target.value)}
                                disabled={loadingUserTeams || !supabaseUuid || acceptingChallengeId === challenge.id || userTeams.length === 0}
                                required
                                className="appearance-none w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                                <option value="" disabled>
                                 {loadingUserTeams ? 'Cargando tus equipos...' : !supabaseUuid ? 'Inicia sesión Supabase' : userTeams.length === 0 ? 'No tienes equipos' : '-- Elige tu equipo --'}
                                </option>
                                {userTeams.map((team) => (
                                    <option key={team.id} value={team.id.toString()}>
                                        {team.Teams}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700"> <ChevronDown className="h-4 w-4" /> </div>
                        </div>
                         {!supabaseUuid && (<p className="text-xs text-red-500 -mt-2 mb-3">Necesitas iniciar sesión en Supabase para seleccionar un equipo.</p>)}
                         {supabaseUuid && !loadingUserTeams && userTeams.length === 0 && (<p className="text-xs text-orange-500 -mt-2 mb-3">No tienes equipos creados. Ve a la pestaña 'Equipo'.</p>)}
                        <button
                            onClick={() => handleAcceptChallenge(challenge.id)}
                            disabled={acceptingChallengeId === challenge.id || !walletAddress || !selectedTeamIdPerChallenge[challenge.id]}
                            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md font-semibold transition duration-150 ease-in-out hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {acceptingChallengeId === challenge.id ? 'Procesando...' : `Aceptar (${challenge.stakeAmount} S)`}
                        </button>
                    </div>
                 ) : (
                     <div className="flex items-center justify-center text-sm text-gray-500 italic h-full bg-gray-50 rounded p-4"> (Eres el creador de este desafío) </div>
                 )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChallengeList;