import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Camera, Monitor, Play, Square, Pen, Circle, Share2,
    Wifi, Battery, ChevronLeft, Eraser, Link, AlertCircle,
    ArrowRight, X, Undo2, MousePointer2, Rewind, Download, Clock, Film
} from 'lucide-react';
import Peer from 'peerjs';

// --- CONSTANTS & STYLES ---
const GLASS_PANEL = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-300";
const BENTO_ROUND = "rounded-[24px]";

// --- HOOK: WEB RTC & SIGNALING ---
const useOpticSignaling = (role, inputCode = null) => {
    const [peer, setPeer] = useState(null);
    const [myId, setMyId] = useState('');
    const [shortCode, setShortCode] = useState('');
    const [status, setStatus] = useState('INIT');
    const [streams, setStreams] = useState([]);
    const [tally, setTally] = useState('STANDBY');
    const connectionsRef = useRef([]);

    useEffect(() => {
        let newPeer;
        const init = async () => {
            setStatus('CONNECTING');
            let peerId;
            let displayCode;

            if (role === 'DIRECTOR') {
                displayCode = Math.floor(1000 + Math.random() * 9000).toString();
                peerId = `optic-flow-${displayCode}`;
                setShortCode(displayCode);
            }

            try {
                const PeerJs = (await import('peerjs')).default;
                newPeer = new PeerJs(peerId);

                newPeer.on('open', (id) => {
                    setMyId(id);
                    setStatus('READY');
                    if (role === 'SATELLITE' && inputCode) {
                        connectToHub(newPeer, `optic-flow-${inputCode}`);
                    }
                });

                newPeer.on('call', (call) => {
                    if (role === 'DIRECTOR') {
                        call.answer();
                        call.on('stream', (remoteStream) => {
                            setStreams(prev => {
                                if (prev.find(s => s.id === call.peer)) return prev;
                                return [...prev, { id: call.peer, stream: remoteStream }];
                            });
                        });
                    }
                });

                newPeer.on('connection', (conn) => {
                    conn.on('open', () => {
                        connectionsRef.current.push(conn);
                        conn.on('data', (data) => {
                            if (data.type === 'TALLY') setTally(data.status);
                        });
                    });
                });

                setPeer(newPeer);
            } catch (err) {
                setStatus('ERROR');
                console.error("PeerJS Error:", err);
            }
        };

        init();
        return () => { if (newPeer) newPeer.destroy(); };
    }, [role, inputCode]);

    const connectToHub = async (currentPeer, hubId) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, facingMode: 'environment' },
                audio: false
            });
            const call = currentPeer.call(hubId, stream);
            const conn = currentPeer.connect(hubId);
            conn.on('data', (data) => {
                if (data.type === 'TALLY') setTally(data.status);
            });
            setStreams([{ id: 'local', stream }]);
        } catch (err) {
            console.error("Erreur caméra:", err);
            alert("Impossible d'accéder à la caméra.");
        }
    };

    const broadcastTally = (newStatus) => {
        setTally(newStatus);
        connectionsRef.current.forEach(conn => {
            if (conn.open) conn.send({ type: 'TALLY', status: newStatus });
        });
    };

    // Nouvelle fonction pour supprimer une caméra manuellement
    const removeStream = (id) => {
        setStreams(prev => prev.filter(s => s.id !== id));
    };

    return { shortCode, status, streams, tally, broadcastTally, removeStream };
};


// --- APP COMPONENT ---
const App = () => {
    const [view, setView] = useState('LANDING');
    const [targetCode, setTargetCode] = useState('');

    return (
        <div className="w-full h-screen bg-black text-white font-sans overflow-hidden selection:bg-blue-500/30">
            {view === 'LANDING' && (
                <LandingScreen
                    onSelectRole={(role) => setView(role)}
                    onJoin={(code) => {
                        setTargetCode(code);
                        setView('SATELLITE');
                    }}
                />
            )}

            {view === 'DIRECTOR' && (
                <DirectorDashboard onBack={() => setView('LANDING')} />
            )}

            {view === 'SATELLITE' && (
                <SatelliteView
                    onBack={() => setView('LANDING')}
                    code={targetCode}
                />
            )}
        </div>
    );
};

// --- LANDING SCREEN ---
const LandingScreen = ({ onSelectRole, onJoin }) => {
    const [inputCode, setInputCode] = useState('');
    const [isJoinMode, setIsJoinMode] = useState(false);

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden">
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />

            <div className="z-10 text-center space-y-8 max-w-4xl px-6 w-full">
                <div className="space-y-2">
                    <h1 className="text-6xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                        MultiCam
                    </h1>
                    <p className="text-white/50 text-lg">Système de captation tactique</p>
                </div>

                {!isJoinMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mx-auto">
                        <RoleCard
                            title="Hub (iPad/PC)"
                            icon={<Monitor size={32} />}
                            desc="Créer une session. Recevoir les flux et analyser."
                            onClick={() => onSelectRole('DIRECTOR')}
                            color="blue"
                        />
                        <RoleCard
                            title="Caméra (Mobile)"
                            icon={<Camera size={32} />}
                            desc="Rejoindre une session avec un code à 4 chiffres."
                            onClick={() => setIsJoinMode(true)}
                            color="green"
                        />
                    </div>
                ) : (
                    <div className={`max-w-md mx-auto w-full p-8 ${GLASS_PANEL} ${BENTO_ROUND} animate-in fade-in zoom-in duration-300`}>
                        <button onClick={() => setIsJoinMode(false)} className="mb-4 text-white/50 hover:text-white flex items-center gap-2 text-sm">
                            <ChevronLeft size={16} /> Retour
                        </button>
                        <h3 className="text-2xl font-bold mb-4">Code de Session</h3>
                        <input
                            type="tel"
                            maxLength={4}
                            placeholder="0000"
                            className="w-full bg-black/40 border border-white/20 rounded-xl p-4 text-center text-4xl font-mono tracking-[1rem] mb-6 focus:outline-none focus:border-blue-500 transition-colors"
                            value={inputCode}
                            onChange={(e) => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                        <button
                            onClick={() => onJoin(inputCode)}
                            disabled={inputCode.length !== 4}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all"
                        >
                            Connecter la Caméra
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- DIRECTOR DASHBOARD ---
const DirectorDashboard = ({ onBack }) => {
    const { shortCode, streams, tally, broadcastTally, removeStream } = useOpticSignaling('DIRECTOR');

    const [activeStreamId, setActiveStreamId] = useState(null);
    const [mode, setMode] = useState('LIVE');
    const [showInfo, setShowInfo] = useState(true);

    // Timer & Galerie
    const [recStartTime, setRecStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [gallery, setGallery] = useState([]);
    const [showGallery, setShowGallery] = useState(false);

    const activeStreamObj = activeStreamId
        ? streams.find(s => s.id === activeStreamId)
        : streams[0];

    // Gestion du Timer REC
    useEffect(() => {
        let interval;
        if (tally === 'RECORDING') {
            if (!recStartTime) setRecStartTime(Date.now());
            interval = setInterval(() => {
                setElapsedTime(Date.now() - (recStartTime || Date.now()));
            }, 1000);
        } else {
            clearInterval(interval);
            setRecStartTime(null);
            setElapsedTime(0);
        }
        return () => clearInterval(interval);
    }, [tally, recStartTime]);

    const toggleRecording = () => {
        const newStatus = tally === 'STANDBY' ? 'RECORDING' : 'STANDBY';
        broadcastTally(newStatus);

        // Création du clip à l'arrêt
        if (newStatus === 'STANDBY' && recStartTime) {
            const duration = Math.floor((Date.now() - recStartTime) / 1000);
            if (duration > 1) { // On ignore les clics accidentels < 1s
                const newClip = {
                    id: Date.now(),
                    time: new Date().toLocaleTimeString(),
                    duration: formatDuration(duration * 1000),
                    angles: streams.length
                };
                setGallery(prev => [newClip, ...prev]);
                setShowGallery(true); // Ouvre la galerie automatiquement
            }
        }
    };

    const formatDuration = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="flex h-full w-full p-4 gap-4 bg-[#0a0a0a]">

            {/* MAIN STAGE */}
            <div className="flex flex-col flex-grow gap-4 w-3/4 h-full relative">
                <div className={`relative flex-grow ${GLASS_PANEL} ${BENTO_ROUND} overflow-hidden group bg-[#111]`}>

                    {/* Code Overlay */}
                    {(showInfo || streams.length === 0) && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-md p-10 rounded-3xl text-center border border-white/10 z-[60] shadow-2xl">
                            <p className="text-white/50 text-sm uppercase tracking-widest mb-4">Code de connexion</p>
                            <div className="text-8xl font-mono font-bold text-blue-500 mb-6 tracking-widest">
                                {shortCode ? shortCode.split('').join(' ') : "..."}
                            </div>
                            <p className="text-sm text-white/40 max-w-xs mx-auto mb-6">
                                Entrez ce code sur les téléphones pour les connecter au Hub.
                            </p>
                            {streams.length > 0 && (
                                <button onClick={() => setShowInfo(false)} className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full text-sm font-bold transition-colors">
                                    Commencer
                                </button>
                            )}
                        </div>
                    )}

                    {/* Galerie Modal */}
                    {showGallery && (
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-xl z-[70] p-8 flex flex-col animate-in fade-in zoom-in-95">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-3xl font-bold flex items-center gap-3"><Film /> Galerie des Clips</h2>
                                <button onClick={() => setShowGallery(false)} className="p-2 hover:bg-white/10 rounded-full"><X /></button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto">
                                {gallery.map(clip => (
                                    <div key={clip.id} className="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 transition-colors group">
                                        <div className="aspect-video bg-black/40 rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
                                            <Play className="text-white/50 group-hover:text-white transition-colors" />
                                            <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 rounded text-xs font-mono">{clip.duration}</div>
                                        </div>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold">Clip {clip.time}</div>
                                                <div className="text-xs text-white/40">{clip.angles} Angle(s) synchro</div>
                                            </div>
                                            <button className="p-2 text-blue-400 hover:text-white hover:bg-blue-500 rounded-lg transition-colors" title="Télécharger Multi-view">
                                                <Download size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {gallery.length === 0 && <div className="text-white/30 italic">Aucun enregistrement.</div>}
                            </div>
                        </div>
                    )}

                    {/* Video Player */}
                    {activeStreamObj ? (
                        <SmartVideoSource
                            key={activeStreamObj.id}
                            stream={activeStreamObj.stream}
                            mode={mode}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/10 text-2xl">
                            En attente de connexion...
                        </div>
                    )}

                    {/* Telestrator */}
                    {mode === 'ANALYSIS' && <TelestratorCanvas />}

                    {/* Top Left Status */}
                    <div className="absolute top-6 left-6 flex gap-2 z-50">
                        <button onClick={onBack} className="p-2 rounded-full bg-black/40 hover:bg-white/20 text-white/70 backdrop-blur-md transition-colors mr-2">
                            <ChevronLeft size={16} />
                        </button>
                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase backdrop-blur-md border border-white/5 ${mode === 'LIVE' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {mode}
                        </div>
                        {tally === 'RECORDING' && (
                            <div className="px-3 py-1.5 bg-red-500 rounded-full text-xs font-bold text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center gap-2">
                                <span>REC</span>
                                <span className="font-mono">{formatDuration(elapsedTime)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* CONTROLS BAR */}
                <div className={`h-24 ${GLASS_PANEL} ${BENTO_ROUND} flex items-center px-8 justify-between shrink-0`}>

                    <div className="flex items-center gap-6">
                        <button onClick={toggleRecording} className="group relative flex items-center justify-center">
                            <div className={`w-14 h-14 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${tally === 'RECORDING' ? 'border-red-500 bg-red-500/10' : 'border-white/20 group-hover:border-white'}`}>
                                <div className={`transition-all duration-300 ${tally === 'RECORDING' ? 'w-5 h-5 bg-red-500 rounded-sm' : 'w-12 h-12 bg-red-500 rounded-full'}`} />
                            </div>
                        </button>
                        <div className="flex flex-col">
                            <span className="text-xs text-white/40 uppercase tracking-widest font-semibold">
                                {tally === 'RECORDING' ? formatDuration(elapsedTime) : (mode === 'LIVE' ? 'Direct' : 'Replay')}
                            </span>
                            <span className="text-xl font-mono tabular-nums tracking-tight text-white/90">
                                {streams.length} Angle(s)
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center bg-black/20 p-1.5 rounded-full border border-white/5">
                        <button onClick={() => setMode('LIVE')} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${mode === 'LIVE' ? 'bg-white text-black shadow-lg' : 'text-white/50'}`}>Live</button>
                        <button onClick={() => setMode('ANALYSIS')} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${mode === 'ANALYSIS' ? 'bg-white text-black shadow-lg' : 'text-white/50'}`}>Analyse</button>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setShowGallery(true)} className="p-3 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors" title="Galerie">
                            <Film size={20} />
                        </button>
                        <button onClick={() => setShowInfo(true)} className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                            <span className="font-mono font-bold text-lg">{shortCode}</span>
                            <Share2 size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* MULTIVIEW GRID */}
            <div className="w-1/4 flex flex-col gap-4 h-full">
                <h2 className="px-2 text-xs font-bold text-white/40 uppercase tracking-widest pt-2">Sources</h2>
                <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-2">
                    {streams.map((s, idx) => (
                        <div
                            key={s.id}
                            onClick={() => setActiveStreamId(s.id)}
                            className={`aspect-video rounded-xl relative cursor-pointer overflow-hidden transition-all duration-200 group ${activeStreamId === s.id ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' : 'opacity-60 hover:opacity-100'} ${GLASS_PANEL}`}
                        >
                            <VideoPlayer stream={s.stream} muted className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-2 z-20 text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">CAM {idx + 1}</div>

                            {/* Bouton de suppression (Croix Rouge) */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Déconnecter cette caméra ?")) removeStream(s.id);
                                }}
                                className="absolute top-2 right-2 z-30 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- SMART PLAYER ---
const SmartVideoSource = ({ stream, mode }) => {
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const [videoBlobUrl, setVideoBlobUrl] = useState(null);

    useEffect(() => {
        if (!stream) return;
        let options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {};
        }

        try {
            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.start(1000);
            return () => {
                if (recorder.state !== 'inactive') recorder.stop();
                if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
            };
        } catch (e) {
            console.error("Erreur MediaRecorder:", e);
        }
    }, [stream]);

    useEffect(() => {
        if (mode === 'ANALYSIS' && chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            setVideoBlobUrl(url);
        }
    }, [mode]);

    if (mode === 'LIVE') {
        return <VideoPlayer stream={stream} className="w-full h-full object-contain" />;
    }

    return (
        <div className="w-full h-full relative group">
            {videoBlobUrl ? (
                <video
                    src={videoBlobUrl}
                    controls
                    className="w-full h-full object-contain"
                    controlsList="nodownload"
                />
            ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                    Chargement du Replay...
                </div>
            )}
        </div>
    );
};

// --- SATELLITE VIEW ---
const SatelliteView = ({ onBack, code }) => {
    const { status, streams, tally } = useOpticSignaling('SATELLITE', code);
    const localStream = streams[0]?.stream;
    const isRecording = tally === 'RECORDING';

    return (
        <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
            <div className={`absolute inset-0 z-50 pointer-events-none transition-all duration-300 border-[12px] rounded-[32px] ${isRecording ? 'border-red-500 animate-pulse' : 'border-green-500 opacity-50'}`} />
            <div className="w-full h-full bg-[#1c1c1e] relative">
                {localStream ? (
                    <VideoPlayer stream={localStream} muted className="w-full h-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-4">
                        {status === 'ERROR' ? <AlertCircle size={48} className="text-red-500" /> : <Wifi size={48} className="animate-pulse" />}
                        <span className="font-mono text-sm">{status === 'CONNECTING' ? 'Connexion...' : status}</span>
                    </div>
                )}
            </div>
            <div className="absolute top-8 left-8 right-8 flex justify-between items-start z-40">
                <button onClick={onBack} className="p-2 rounded-full bg-black/40 backdrop-blur text-white/70 hover:bg-white/20">
                    <ChevronLeft size={20} />
                </button>
                <div className={`px-4 py-2 rounded-full backdrop-blur-xl border border-white/10 flex items-center gap-3 transition-colors ${isRecording ? 'bg-red-500/80' : 'bg-black/60'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-xs font-black tracking-widest text-white">{isRecording ? 'ON AIR' : 'STANDBY'}</span>
                </div>
                <div className="bg-black/40 backdrop-blur px-3 py-1.5 rounded-lg flex items-center gap-2 text-white/80 border border-white/10">
                    <Battery size={14} /> <span className="text-[10px] font-mono">100%</span>
                </div>
            </div>
        </div>
    );
};

// --- TELESTRATOR (Avec Outil Curseur) ---
const TelestratorCanvas = () => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState('CURSOR'); // Par défaut CURSEUR pour permettre le clic
    const [color, setColor] = useState('#FACC15');
    const [history, setHistory] = useState([]);
    const startPos = useRef({ x: 0, y: 0 });
    const snapshot = useRef(null);

    // Le canvas laisse passer les clics si l'outil est CURSOR
    const pointerEventsClass = tool === 'CURSOR' ? 'pointer-events-none' : 'pointer-events-auto cursor-crosshair';

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const saveToHistory = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev, data]);
    };

    const undo = () => {
        if (history.length === 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const newHistory = [...history];
        const previousState = newHistory.pop();
        if (previousState) {
            ctx.putImageData(previousState, 0, 0);
            setHistory(newHistory);
        }
    };

    const clearCanvas = () => {
        saveToHistory();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const startDrawing = (e) => {
        if (tool === 'CURSOR') return; // Sécurité
        const { x, y } = getPos(e);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        saveToHistory();
        snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        startPos.current = { x, y };
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing || tool === 'CURSOR') return;
        const { x, y } = getPos(e);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (tool === 'PEN') {
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            ctx.putImageData(snapshot.current, 0, 0);
            ctx.beginPath();
            const sx = startPos.current.x;
            const sy = startPos.current.y;
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            if (tool === 'ARROW') drawArrow(ctx, sx, sy, x, y);
            else if (tool === 'CROSS') drawCross(ctx, sx, sy, x, y);
            else if (tool === 'CIRCLE') drawCircle(ctx, sx, sy, x, y);
            ctx.stroke();
        }
    };

    const drawArrow = (ctx, fromX, fromY, toX, toY) => {
        const headlen = 20;
        const dx = toX - fromX;
        const dy = toY - fromY;
        const angle = Math.atan2(dy, dx);
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    };
    const drawCross = (ctx, sx, sy, ex, ey) => {
        ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
        ctx.moveTo(sx, ey); ctx.lineTo(ex, sy);
    };
    const drawCircle = (ctx, sx, sy, ex, ey) => {
        ctx.ellipse((sx + ex) / 2, (sy + ey) / 2, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2, 0, 0, 2 * Math.PI);
    };

    useEffect(() => {
        const cvs = canvasRef.current;
        cvs.width = cvs.parentElement.offsetWidth;
        cvs.height = cvs.parentElement.offsetHeight;
    }, []);

    return (
        <>
            <canvas
                ref={canvasRef}
                className={`absolute inset-0 z-30 touch-none ${pointerEventsClass}`}
                onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)} onMouseLeave={() => setIsDrawing(false)}
                onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => setIsDrawing(false)}
            />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 p-2 rounded-full bg-black/80 backdrop-blur-xl border border-white/10 z-50 animate-in slide-in-from-bottom-4 shadow-2xl">
                <ColorBtn color="#FACC15" active={color} onClick={setColor} />
                <ColorBtn color="#EF4444" active={color} onClick={setColor} />
                <ColorBtn color="#3B82F6" active={color} onClick={setColor} />
                <div className="w-[1px] bg-white/20 mx-1" />
                <ToolBtn icon={<MousePointer2 size={18} />} active={tool === 'CURSOR'} onClick={() => setTool('CURSOR')} />
                <ToolBtn icon={<Pen size={18} />} active={tool === 'PEN'} onClick={() => setTool('PEN')} />
                <ToolBtn icon={<ArrowRight size={18} />} active={tool === 'ARROW'} onClick={() => setTool('ARROW')} />
                <ToolBtn icon={<Circle size={18} />} active={tool === 'CIRCLE'} onClick={() => setTool('CIRCLE')} />
                <ToolBtn icon={<X size={18} />} active={tool === 'CROSS'} onClick={() => setTool('CROSS')} />
                <div className="w-[1px] bg-white/20 mx-1" />
                <button onClick={undo} className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10"><Undo2 size={18} /></button>
                <button onClick={clearCanvas} className="p-2 text-red-400 hover:text-red-300 rounded-full hover:bg-white/10"><Eraser size={18} /></button>
            </div>
        </>
    );
};

// --- HELPER COMPONENTS ---
const ToolBtn = ({ icon, active, onClick }) => (
    <button onClick={onClick} className={`p-2 rounded-full transition-all duration-200 ${active ? 'bg-white text-black shadow-lg scale-110' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>{icon}</button>
);
const ColorBtn = ({ color, active, onClick }) => (
    <button onClick={() => onClick(color)} className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${active === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`} style={{ background: color }} />
);
const VideoPlayer = ({ stream, muted = false, className }) => {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream;
    }, [stream]);
    return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
};
const RoleCard = ({ title, icon, desc, onClick, color }) => (
    <button onClick={onClick} className={`group relative p-8 ${GLASS_PANEL} ${BENTO_ROUND} hover:bg-white/10 transition-all duration-300 text-left`}>
        <div className={`absolute top-6 right-6 p-3 rounded-full transition-colors ${color === 'blue' ? 'bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white' : 'bg-green-500/20 text-green-400 group-hover:bg-green-500 group-hover:text-white'}`}>{icon}</div>
        <div className="mt-12 space-y-2"><h3 className="text-2xl font-semibold">{title}</h3><p className="text-white/40 text-sm leading-relaxed">{desc}</p></div>
    </button>
);

export default App;