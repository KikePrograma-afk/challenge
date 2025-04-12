// src/components/VerifyMatch.tsx
import React, { useState } from 'react';
import { ethers } from 'ethers';
import { CheckCircle } from 'lucide-react';
import { CHALLENGE_ABI } from '../contracts/abi';

interface VerifyMatchProps {
  account: string;
  contractAddress: string;
}

// Helper function to check if all submitted IDs are present in the API set (and counts match)
function checkTeamMatch(submittedIds: string[], apiTeamIdsSet: Set<string>): boolean {
  if (submittedIds.length !== 6 || apiTeamIdsSet.size !== 6) return false;
  // Ensure every ID submitted via the contract is present in the set derived from the API
  return submittedIds.every(id => apiTeamIdsSet.has(id));
}

const VerifyMatch: React.FC<VerifyMatchProps> = ({ account, contractAddress }) => {
  const [challengeId, setChallengeId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const verifyMatch = async () => {
    setStatus('');
    // Basic validation for input IDs
    if (!matchId || !challengeId || !/^\d+$/.test(challengeId) || !/^\d+$/.test(matchId)) {
      setStatus('Error: Ingresa un ID de Desafío y un ID de Partida numéricos válidos.');
      return;
    }
    // Check for MetaMask
    if (!window.ethereum) {
      setStatus('Error: Instala MetaMask.');
      return;
    }

    setLoading(true);
    setStatus('Iniciando verificación...');

    let provider: ethers.BrowserProvider | null = null;

    try {
      // Initialize ethers provider and contract reader
      provider = new ethers.BrowserProvider(window.ethereum);
      const contractReader = new ethers.Contract(contractAddress, CHALLENGE_ABI, provider);

      setStatus('Obteniendo datos del desafío del contrato...');
      const challengeData = await contractReader.getChallenge(challengeId);
      if (!challengeData || challengeData.id === 0n) { // Check if challenge exists
        throw new Error(`Desafío #${challengeId} no encontrado en el contrato.`);
      }

      // Validate challenge status (must be 'Accepted')
      const challengeStatus = Number(challengeData.status);
      if (challengeStatus !== 1) { // 1 corresponds to Accepted status
        const statusMap = ['Creado', 'Aceptado', 'Pagado', 'Disputado', 'Cancelado'];
        throw new Error(`El desafío debe estar en estado 'Aceptado' para verificar. Estado actual: ${statusMap[challengeStatus] || `Desconocido (${challengeStatus})`}.`);
      }

      // Extract relevant data from the challenge
      const challengeAcceptTime = Number(challengeData.acceptTime); // When the challenge was accepted (Unix timestamp)
      const challengeRequiredStartTime = Number(challengeData.requiredStartTime); // Optional minimum start time (Unix timestamp)
      const contractChallengingTeamIds: string[] = challengeData.challengingTeam.map((id: bigint) => id.toString());
      const contractAcceptingTeamIds: string[] = challengeData.acceptingTeam.map((id: bigint) => id.toString());

      setStatus(`Verificando partida ${matchId} con la API...`);
      // --- API FETCH: Only use /metadata ---
      const apiUrl = `https://api.deadlock-api.com/v1/matches/${matchId}/metadata`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Error API: Partida con ID ${matchId} no encontrada (404).`);
        }
        throw new Error(`Error API ${response.status}: ${response.statusText}`);
      }

      const apiData = await response.json();
      const matchInfo = apiData?.match_info;

      // Validate essential API data structure
      if (!matchInfo || !matchInfo.players || typeof matchInfo.winning_team === 'undefined') {
        throw new Error('Datos inválidos o incompletos recibidos de la API (/metadata).');
      }
       if (matchInfo.players.length < 10) {
           // Note: The contract requires exactly 6v6, so we check for 12 later.
           // This check is just a basic sanity check for a valid match.
           console.warn(`Advertencia: La API reporta ${matchInfo.players.length} jugadores, se esperan al menos 10 para una partida válida.`);
       }

      // --- Get start_time ONLY from /metadata ---
      let apiStartTimeUnix: number | null = null;
      if (matchInfo.start_time && typeof matchInfo.start_time === 'number' && matchInfo.start_time > 0 && !isNaN(matchInfo.start_time)) {
         // Assuming API provides unix timestamp directly as a number
         apiStartTimeUnix = matchInfo.start_time;
      } else if (matchInfo.start_time && typeof matchInfo.start_time === 'string' && !isNaN(Date.parse(matchInfo.start_time))) {
         // If it's a parseable date string
         apiStartTimeUnix = Math.floor(new Date(matchInfo.start_time).getTime() / 1000);
      }

      // --- VALIDATE start_time obtained from /metadata ---
      if (apiStartTimeUnix === null || isNaN(apiStartTimeUnix) || apiStartTimeUnix <= 0) {
          throw new Error("No se pudo obtener un 'start_time' válido desde la respuesta de /metadata de la API.");
      }
      // --- End of simplified start_time logic ---

      const winningTeamIndexApi = Number(matchInfo.winning_team); // API uses 0 or 1

      // Extract player IDs from API response into sets for easy lookup
      const apiTeam0Ids = new Set<string>();
      const apiTeam1Ids = new Set<string>();
      matchInfo.players.forEach((p: any) => {
        if (p?.account_id) {
          // Convert potential numbers or strings safely to string representation of BigInt
          const idStr = BigInt(p.account_id).toString();
          if (p.team === 0) apiTeam0Ids.add(idStr);
          else if (p.team === 1) apiTeam1Ids.add(idStr);
        }
      });

      // --- Validate Team Sizes (Strict 6v6 Required by Contract) ---
      if (apiTeam0Ids.size !== 6 || apiTeam1Ids.size !== 6) {
        throw new Error(`Equipos incompletos encontrados en la API. Se requieren 6 jugadores por equipo. Encontrados: Equipo 0 (${apiTeam0Ids.size}), Equipo 1 (${apiTeam1Ids.size}).`);
      }

      setStatus('Validando tiempos de la partida...');
      const apiStartTimeFormatted = new Date(apiStartTimeUnix * 1000).toLocaleString();
      const challengeAcceptTimeFormatted = new Date(challengeAcceptTime * 1000).toLocaleString();

      // Check 1: Match must start *after* the challenge was accepted
      if (apiStartTimeUnix < challengeAcceptTime) {
        throw new Error(`La partida empezó (${apiStartTimeFormatted}) ANTES de que el desafío fuera aceptado (${challengeAcceptTimeFormatted}).`);
      }
      // Check 2: If a required start time was set, match must start after it
      if (challengeRequiredStartTime !== 0 && apiStartTimeUnix < challengeRequiredStartTime) {
        const challengeRequiredStartTimeFormatted = new Date(challengeRequiredStartTime * 1000).toLocaleString();
        throw new Error(`La partida empezó (${apiStartTimeFormatted}) ANTES del tiempo mínimo requerido por el desafío (${challengeRequiredStartTimeFormatted}).`);
      }
      setStatus('Validación de tiempos completada.');

      setStatus('Validando coincidencia de equipos...');
      // Check if the challenging team from contract matches API team 0 AND accepting matches API team 1
      const challengingIsApi0 = checkTeamMatch(contractChallengingTeamIds, apiTeam0Ids);
      const acceptingIsApi1 = checkTeamMatch(contractAcceptingTeamIds, apiTeam1Ids);

      // OR Check if the challenging team from contract matches API team 1 AND accepting matches API team 0
      const challengingIsApi1 = checkTeamMatch(contractChallengingTeamIds, apiTeam1Ids);
      const acceptingIsApi0 = checkTeamMatch(contractAcceptingTeamIds, apiTeam0Ids);

      // If neither combination matches exactly
      if (!(challengingIsApi0 && acceptingIsApi1) && !(challengingIsApi1 && acceptingIsApi0)) {
        // Provide a more detailed error message
        const allContractPlayerIds = new Set([...contractChallengingTeamIds, ...contractAcceptingTeamIds]);
        const allApiPlayerIds = new Set([...apiTeam0Ids, ...apiTeam1Ids]);
        const missingFromApi = contractChallengingTeamIds.concat(contractAcceptingTeamIds).filter(id => !allApiPlayerIds.has(id));
        const extraInApi = Array.from(allApiPlayerIds).filter(id => !allContractPlayerIds.has(id));

        let errorMsg = 'Los equipos del desafío no coinciden exactamente con los equipos de la partida en la API.';
        if (missingFromApi.length > 0) {
          errorMsg += ` Jugadores del desafío NO encontrados en la partida: ${missingFromApi.join(', ')}.`;
        }
        if (extraInApi.length > 0) {
           errorMsg += ` Jugadores en la partida NO encontrados en el desafío: ${extraInApi.join(', ')}.`;
        }
         if (missingFromApi.length === 0 && extraInApi.length === 0) {
             errorMsg += ' Todos los 12 jugadores están presentes, pero están mezclados entre los equipos incorrectamente según la API.'
         }

        throw new Error(errorMsg);
      }
      setStatus('Validación de equipos completada.');

      setStatus('Preparando transacción para el contrato...');
      // Get signer to send transaction
      const signer = await provider.getSigner();
      const contractWriter = new ethers.Contract(contractAddress, CHALLENGE_ABI, signer);

      // Convert API team player IDs to BigInt for the contract function
      const team0PlayersBigInt = Array.from(apiTeam0Ids).map(id => BigInt(id));
      const team1PlayersBigInt = Array.from(apiTeam1Ids).map(id => BigInt(id));

      setStatus('Enviando transacción para verificar y pagar...');
      // Call the contract function to verify and potentially payout
      const tx = await contractWriter.verifyMatchOutcomeAndPay(
        BigInt(challengeId),    // challengeId (must be BigInt)
        BigInt(matchId),        // matchId (must be BigInt)
        BigInt(apiStartTimeUnix), // matchStartTime (must be BigInt)
        winningTeamIndexApi,    // winningTeamIndex (0 or 1)
        team0PlayersBigInt,     // apiTeam0SteamIds
        team1PlayersBigInt      // apiTeam1SteamIds
      );

      setStatus(`Transacción enviada (${tx.hash.substring(0,10)}...). Esperando confirmación...`);
      // Wait for 1 block confirmation
      await tx.wait(1);

      setStatus(`¡Éxito! Partida ${matchId} verificada para el desafío ${challengeId} y pago procesado. Hash: ${tx.hash}`);
      // Clear inputs on success
      setChallengeId('');
      setMatchId('');

    } catch (error: any) {
      console.error('Error detallado en verifyMatch:', error);
      // Attempt to extract revert reason if it's a contract error
      let message = error.message || 'Ocurrió un error desconocido.';
      if (error.reason) {
          message = `Error de contrato: ${error.reason}`;
      } else if (error.data?.message) {
          message = `Error: ${error.data.message}`;
      } else if (error.error?.message) {
           message = `Error: ${error.error.message}`;
      }
      setStatus(`Error: ${message}`);
    } finally {
      setLoading(false); // Ensure loading is turned off
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-6">
        <CheckCircle className="w-6 h-6 mr-2 text-blue-500" />
        <h2 className="text-2xl font-bold">Verificar Partida y Pagar</h2>
      </div>
      <div className="space-y-4">
        <div>
          <label htmlFor="verify-challenge-id" className="block text-sm font-medium text-gray-700 mb-1">ID del Desafío</label>
          <input
            type="text"
            inputMode="numeric" // Hint for numeric keyboard on mobile
            pattern="\d*"       // Ensure only digits can be typed (browser validation)
            id="verify-challenge-id"
            value={challengeId}
            onChange={(e) => /^\d*$/.test(e.target.value) && setChallengeId(e.target.value)} // Allow only digits
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            placeholder="ID numérico del desafío"
            disabled={loading}
            aria-describedby="challenge-id-desc"
          />
          <p id="challenge-id-desc" className="text-xs text-gray-500 mt-1">El ID del desafío creado en la plataforma.</p>
        </div>
        <div>
          <label htmlFor="verify-match-id" className="block text-sm font-medium text-gray-700 mb-1">ID de la Partida (API)</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            id="verify-match-id"
            value={matchId}
            onChange={(e) => /^\d*$/.test(e.target.value) && setMatchId(e.target.value)} // Allow only digits
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            placeholder="ID numérico de la partida jugada"
            disabled={loading}
            aria-describedby="match-id-desc"
          />
           <p id="match-id-desc" className="text-xs text-gray-500 mt-1">El ID de la partida obtenido de la API de Deadlock (Ej: 34756770).</p>
        </div>
        {/* Status Display Area */}
        {status && (
          <div className={`mt-4 p-3 rounded-md text-sm font-medium border ${
            status.startsWith('Error:') ? 'bg-red-50 text-red-800 border-red-300' :
            status.startsWith('¡Éxito!') ? 'bg-green-50 text-green-800 border-green-300' :
            'bg-blue-50 text-blue-800 border-blue-300' // Default/Loading
          }`}
          role="alert" // Better accessibility
          >
            {/* Make URLs clickable if status contains one */}
            {status.includes('Hash:') ? (
                <>
                    {status.split('Hash: ')[0]}Hash: <a href={`https://sepolia.etherscan.io/tx/${status.split('Hash: ')[1]}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-700">{status.split('Hash: ')[1]}</a>
                </>
            ) : (
                status
            )}

          </div>
        )}
        {/* Action Button */}
        <button
          onClick={verifyMatch}
          disabled={loading || !account || !challengeId || !matchId} // Also disable if inputs are empty
          className={`w-full bg-blue-600 text-white py-3 px-4 rounded-md font-semibold transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${
            !(loading || !account || !challengeId || !matchId) ? 'hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500' : ''
          }`}
        >
          {loading ? (
              <div className="flex justify-center items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verificando...
              </div>
          ) : 'Verificar Partida y Pagar'}
        </button>
        {!account && (
             <p className="text-center text-sm text-yellow-700 bg-yellow-100 p-2 rounded-md border border-yellow-300">
                 Conecta tu billetera (MetaMask) para verificar.
             </p>
        )}
      </div>
    </div>
  );
};

export default VerifyMatch;