import React, { useState, useEffect } from 'react';
// import { ethers } from 'ethers'; // No parece usarse directamente aquí
import { Wallet, CircleDollarSign, CheckCircle, List, Users } from 'lucide-react';
import CreateChallenge from './components/CreateChallenge';
import ChallengeList from './components/ChallengeList';
import VerifyMatch from './components/VerifyMatch';
import ConnectWallet from './components/ConnectWallet';
import TeamManagement from './components/TeamManagement'; // Aunque ocultemos el acceso, el componente sigue existiendo
import { supabase } from './lib/supabase'; // Importa tu cliente Supabase
import { Session } from '@supabase/supabase-js'; // Importa el tipo Session

// Declaración global para window.ethereum (sin cambios)
declare global {
    interface Window {
        ethereum?: {
            request: (request: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
            on?: (event: string, listener: (...args: any[]) => void) => void;
            removeListener?: (event: string, listener: (...args: any[]) => void) => void; // Añadir para limpieza
        }
    }
}

const CONTRACT_ADDRESS = '0x9fef9cb6026067b533fea49249a7151dc6b7bf0b'; // Asegúrate que es correcta

function App() {
  // --- ESTADOS SEPARADOS ---
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [supabaseUserUuid, setSupabaseUserUuid] = useState<string | null>(null);
  // ------------------------

  // --- ESTADO INICIAL DE PESTAÑA MODIFICADO ---
  // Cambiamos el tipo para excluir 'team' y el valor inicial a 'create'
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'verify'>('create');
  // --------------------------------------------

  const [loadingAuth, setLoadingAuth] = useState(true);

  // --- Efecto para Conexión de Wallet (MetaMask) ---
  useEffect(() => {
    let isMounted = true;
    const checkWalletConnection = async () => { /* ... (código sin cambios) ... */
        if (window.ethereum) {
            try {
              const accounts = await window.ethereum.request({ method: 'eth_accounts' });
              if (isMounted && accounts.length > 0) {
                setWalletAddress(accounts[0]);
                console.log("App.tsx: Wallet connected on load:", accounts[0]);
              } else if (isMounted) {
                console.log("App.tsx: Wallet not connected on load");
              }
            } catch (error) {
              console.error('App.tsx: Error checking wallet connection:', error);
            }
          } else {
              console.warn("App.tsx: MetaMask not detected");
          }
    };
    checkWalletConnection();
    const handleAccountsChanged = (accounts: string[]) => { /* ... (código sin cambios) ... */
        if (isMounted) {
            if (accounts.length > 0) {
                setWalletAddress(accounts[0]);
                console.log("App.tsx: Wallet account changed:", accounts[0]);
            } else {
                setWalletAddress(''); // Desconectado
                console.log("App.tsx: Wallet disconnected");
            }
         }
    };
    if (window.ethereum?.on) { window.ethereum.on('accountsChanged', handleAccountsChanged); }
    return () => { isMounted = false; if (window.ethereum?.removeListener) { window.ethereum.removeListener('accountsChanged', handleAccountsChanged); } };
  }, []);

  // --- Efecto para Sesión de Supabase ---
  useEffect(() => {
    let isMounted = true;
    setLoadingAuth(true);
    supabase.auth.getSession().then(({ data: { session } }) => { /* ... (código sin cambios) ... */
        if (isMounted) {
            setSupabaseSession(session);
            setSupabaseUserUuid(session?.user?.id ?? null);
            console.log("App.tsx: Initial Supabase Session:", session);
            console.log("App.tsx: Initial Supabase UUID:", session?.user?.id);
            setLoadingAuth(false);
        }
    }).catch(err => { if (isMounted) { console.error("App.tsx: Error getting Supabase session:", err); setLoadingAuth(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { /* ... (código sin cambios) ... */
        if (isMounted) {
            setSupabaseSession(session);
            setSupabaseUserUuid(session?.user?.id ?? null);
            console.log("App.tsx: Supabase auth state changed, new session:", session);
            console.log("App.tsx: Supabase auth state changed, new UUID:", session?.user?.id);
            if(loadingAuth) setLoadingAuth(false);
        }
    });
    return () => { isMounted = false; subscription?.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Handler ya no necesario (no se puede acceder a TeamManagement desde tabs) ---
  // const handleTeamCreated = (_teamId: number) => {
  //   console.log("App.tsx: Team created, switching to Create Challenge tab.");
  //   setActiveTab('create');
  // };
  // ----------------------------------------------------------------------------

  // --- Renderizado del Contenido Principal ---
  const renderContent = () => {
    // Requiere Wallet conectada
    if (!walletAddress) {
      return <ConnectWallet onConnect={async () => { /* ... (código sin cambios) ... */
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                if (accounts.length > 0) {
                    setWalletAddress(accounts[0]);
                }
            } catch (error: any) {
                if (error.code === 4001) { console.log('User rejected connection request.'); }
                else { console.error("App.tsx: Error connecting wallet:", error); }
            }
        } else { alert("Please install MetaMask to connect your wallet."); }
      }} />;
    }

    // Carga de sesión Supabase
    if (loadingAuth) {
        return <div className='text-center p-10'>Verificando sesión de usuario...</div>;
    }

    // Switch sin el caso 'team'
    switch (activeTab) {
      // case 'team': // <-- Caso eliminado
      //   return <TeamManagement onTeamCreated={handleTeamCreated} />;
      case 'create':
        return <CreateChallenge
          account={supabaseUserUuid}
          contractAddress={CONTRACT_ADDRESS}
        />;
      case 'list':
        // Asegúrate ChallengeListProps acepta string | null para supabaseUuid
        return <ChallengeList
                  walletAddress={walletAddress}
                  supabaseUuid={supabaseUserUuid}
                  contractAddress={CONTRACT_ADDRESS}
                />;
      case 'verify':
        // Asegúrate VerifyMatchProps acepta string para account (walletAddress)
        return <VerifyMatch
                  account={walletAddress}
                  contractAddress={CONTRACT_ADDRESS}
                />;
      default:
        // Si por alguna razón activeTab es inválido, mostrar algo
         // Como 'create' es el default, esto es menos probable
        console.warn("App.tsx: Estado de activeTab inválido:", activeTab);
        // Redirigir a la pestaña por defecto o mostrar un error
        setActiveTab('create'); // Volver a la pestaña por defecto
        return <div className='text-center p-4'>Cargando...</div>;
    }
  };

  // --- JSX Principal ---
  return (
    <div className="min-h-screen bg-gray-100">
      {/* --- Barra de Navegación (sin cambios) --- */}
      <nav className="bg-white shadow-lg">
        {/* ... (código navbar igual que antes) ... */}
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Deadlock Challenge</h1>
              </div>
            </div>
            {walletAddress && (
              <div className="flex items-center space-x-4">
                 <span className={`hidden sm:inline-block text-xs px-2 py-0.5 rounded ${loadingAuth ? 'bg-yellow-100 text-yellow-700' : supabaseSession ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {loadingAuth ? 'Supabase...' : supabaseSession ? 'Supabase OK' : 'No Supabase'}
                </span>
                <span className="text-sm text-gray-500" title={walletAddress}>
                  <Wallet className="inline w-4 h-4 mr-1 align-text-bottom"/>
                  {`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
                </span>
              </div>
            )}
             {!walletAddress && (
                <div className="flex items-center">
                    <button
                         onClick={async () => { /* ... (conectar wallet) ... */
                            if (window.ethereum) {
                                try {
                                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                                    if (accounts.length > 0) setWalletAddress(accounts[0]);
                                } catch (error: any) { if (error.code !== 4001) console.error("Error connecting:", error); }
                             } else { alert("Please install MetaMask."); }
                         }}
                         className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-md text-sm font-medium"
                    >
                        Conectar Wallet
                    </button>
                </div>
             )}
          </div>
        </div>
      </nav>

      {/* --- Pestañas de Navegación (BOTÓN "Equipo" ELIMINADO) --- */}
      {walletAddress && (
        <div className="flex justify-center space-x-2 sm:space-x-4 py-4 bg-white shadow-sm overflow-x-auto px-2">
          {/* --- BOTÓN "Equipo" ELIMINADO ---
          <button
            onClick={() => setActiveTab('team')} // Ya no es válido
            className={`flex items-center px-3 py-2 rounded-md text-sm sm:text-base transition-colors duration-150 ease-in-out ${
              activeTab === 'team' ? 'bg-blue-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            Equipo
          </button>
           */}

          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center px-3 py-2 rounded-md text-sm sm:text-base transition-colors duration-150 ease-in-out ${
              activeTab === 'create' ? 'bg-blue-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CircleDollarSign className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            Crear Desafío
          </button>
          <button
            onClick={() => setActiveTab('list')}
             className={`flex items-center px-3 py-2 rounded-md text-sm sm:text-base transition-colors duration-150 ease-in-out ${
              activeTab === 'list' ? 'bg-blue-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <List className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            Ver Desafíos
          </button>
          <button
            onClick={() => setActiveTab('verify')}
             className={`flex items-center px-3 py-2 rounded-md text-sm sm:text-base transition-colors duration-150 ease-in-out ${
              activeTab === 'verify' ? 'bg-blue-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
            Verificar Partida
          </button>
        </div>
      )}
      {/* --- FIN Pestañas de Navegación --- */}


      {/* --- Contenido Principal --- */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;