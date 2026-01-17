
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Search, Calendar, Clock, RefreshCw, Radio, 
  FileText, Music, Loader2, AlertCircle, Activity, Plus 
} from 'lucide-react';
import { jsPDF } from 'jspdf';

// --- CONFIGURAÇÕES E TIPOS ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/1xFRBBHpmn38TiBdZcwn2556811FKkfbeEB3HmmdxT1s/export?format=csv';

interface RadioTrack {
  id: string;
  data: string;
  hora: string;
  artista: string;
  musica: string;
}

// --- SERVIÇO DE CAPAS (iTUNES) ---
const ARTWORK_CACHE = new Map<string, string | null>();
const fetchArtwork = async (artist: string, track: string): Promise<string | null> => {
  const query = `${artist} ${track}`.toLowerCase().trim();
  if (ARTWORK_CACHE.has(query)) return ARTWORK_CACHE.get(query) || null;
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
    const data = await res.json();
    const url = data.results?.[0]?.artworkUrl100 || null;
    ARTWORK_CACHE.set(query, url);
    return url;
  } catch { return null; }
};

// --- COMPONENTE: CARD DE MÚSICA ---
const MusicCard = ({ track, isNowPlaying = false }: { track: RadioTrack, isNowPlaying?: boolean }) => {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArtwork(track.artista, track.musica).then(url => {
      setArtwork(url);
      setLoading(false);
    });
  }, [track.artista, track.musica]);

  const cardBase = isNowPlaying 
    ? "bg-slate-900 rounded-[2.5rem] border-4 border-yellow-400 shadow-2xl scale-[1.02] z-10 p-6 sm:p-8" 
    : "bg-white rounded-[2rem] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-5 sm:p-6";

  return (
    <div className={`flex items-center gap-6 ${cardBase}`}>
      <div className={`relative flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-inner ${isNowPlaying ? 'w-24 h-24 sm:w-36 sm:h-36' : 'w-20 h-20 sm:w-28 sm:h-28'}`}>
        {loading ? (
          <div className="w-full h-full animate-pulse bg-slate-200" />
        ) : artwork ? (
          <img src={artwork} alt="Capa" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Music size={isNowPlaying ? 48 : 32} />
          </div>
        )}
      </div>

      <div className="flex-grow min-w-0">
        <h3 className={`font-black uppercase truncate leading-tight ${isNowPlaying ? 'text-white text-xl sm:text-2xl' : 'text-slate-800 text-lg sm:text-xl'}`}>
          {track.musica}
        </h3>
        <p className={`font-bold uppercase truncate ${isNowPlaying ? 'text-yellow-400 text-sm sm:text-base' : 'text-sky-500 text-sm sm:text-base'}`}>
          {track.artista}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${isNowPlaying ? 'bg-white/10 text-white/60' : 'bg-slate-50 text-slate-500'}`}>
            <Clock size={14} />
            <span className="font-bold tabular-nums text-xs sm:text-sm">{track.hora}</span>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-widest ${isNowPlaying ? 'text-white/30' : 'text-slate-300'}`}>
            {track.data}
          </span>
        </div>
      </div>

      {isNowPlaying && (
        <div className="hidden lg:block">
          <div className="bg-red-500 text-white px-4 py-2 rounded-full animate-pulse flex items-center gap-2">
            <Activity size={14} />
            <span className="text-[10px] font-black uppercase tracking-tighter">AO VIVO</span>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE: APLICAÇÃO PRINCIPAL ---
const App = () => {
  const [data, setData] = useState<RadioTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date: '', hour: '', search: '' });
  const [visibleCount, setVisibleCount] = useState(15);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CSV_URL}&t=${Date.now()}`);
      const text = await res.text();
      const lines = text.split('\n').filter(l => l.trim());
      
      const rows = lines.map(line => {
        // Regex para lidar com vírgulas dentro de aspas no CSV
        const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        return cells.map(c => c.replace(/^"|"$/g, '').trim());
      });

      if (rows.length < 2) return;

      // MAPEAMENTO INTELIGENTE DE COLUNAS
      const header = rows[0].map(h => 
        h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      );

      const idxData = header.findIndex(h => h === 'data' || h === 'dia' || h === 'date');
      const idxHora = header.findIndex(h => h === 'hora' || h === 'time' || h === 'horario');
      const idxArtista = header.findIndex(h => h === 'artista' || h === 'artist');
      const idxMusica = header.findIndex(h => h === 'musica' || h === 'track' || h === 'titulo');

      const parsed = rows.slice(1).map((row, i) => ({
        id: `track-${i}`,
        data: row[idxData] || '---',
        hora: (row[idxHora] || '').substring(0, 5),
        artista: row[idxArtista] || 'Desconhecido',
        musica: row[idxMusica] || 'Sem Título'
      }))
      .filter(t => t.artista !== 'Desconhecido' && t.data !== '---')
      .sort((a, b) => {
        // Ordenação por Data (DD/MM/YYYY) e depois Hora
        const [dA, mA, yA] = a.data.split('/');
        const [dB, mB, yB] = b.data.split('/');
        const dateA = `${yA}${mA}${dA} ${a.hora}`;
        const dateB = `${yB}${mB}${dB} ${b.hora}`;
        return dateB.localeCompare(dateA);
      });

      setData(parsed);
      
      if (parsed.length > 0 && !filters.date) {
        setFilters(f => ({ ...f, date: parsed[0].data }));
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [filters.date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredData = useMemo(() => {
    return data.filter(t => {
      const mDate = filters.date ? t.data === filters.date : true;
      const mHour = filters.hour ? t.hora.startsWith(filters.hour) : true;
      const mSearch = filters.search ? 
        (`${t.artista} ${t.musica}`).toLowerCase().includes(filters.search.toLowerCase()) : true;
      return mDate && mHour && mSearch;
    });
  }, [data, filters]);

  const exportPDF = () => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('pt-BR');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("METROPOLITANA FM - RELATÓRIO DE PLAYLIST", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${dateStr} | Filtro: ${filters.date || 'Geral'}`, 14, 28);
    
    let y = 45;
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.text("DATA", 16, y);
    doc.text("HORA", 45, y);
    doc.text("ARTISTA", 75, y);
    doc.text("MÚSICA", 135, y);

    doc.setTextColor(30, 41, 59);
    filteredData.forEach(t => {
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(t.data, 16, y);
      doc.text(t.hora, 45, y);
      doc.text(t.artista.substring(0, 30), 75, y);
      doc.text(t.musica.substring(0, 30), 130, y);
      doc.setDrawColor(241, 245, 249);
      doc.line(14, y + 2, 196, y + 2);
    });
    
    const nameSuffix = filters.date ? filters.date.replace(/\//g, '-') : 'Geral';
    doc.save(`Playlist_${nameSuffix}.pdf`);
  };

  const uniqueDates = Array.from(new Set(data.map(d => d.data))).sort((a, b) => {
    const [dA, mA, yA] = a.split('/');
    const [dB, mB, yB] = b.split('/');
    return `${yB}${mB}${dB}`.localeCompare(`${yA}${mA}${dA}`);
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-400 p-3 rounded-2xl shadow-xl shadow-yellow-200">
              <Radio className="text-white" size={28} />
            </div>
            <div>
              <h1 className="font-black text-2xl tracking-tighter text-slate-900 leading-none">
                METROPOLITANA <span className="text-sky-500">FM</span>
              </h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Dashboard Diretor</p>
            </div>
          </div>
          <button 
            onClick={fetchData} 
            className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all hover:text-sky-500"
          >
            <RefreshCw size={22} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-10">
        <section className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 mb-12 border border-white">
          <div className="relative mb-5">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
            <input 
              type="text" 
              placeholder="Pesquisar por artista ou música..." 
              className="w-full pl-16 pr-6 py-5 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 text-lg outline-none focus:ring-4 focus:ring-sky-50 transition-all"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-5">
            <div className="flex-grow relative">
              <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-sky-500" size={20} />
              <select 
                className="w-full pl-14 pr-10 py-5 bg-slate-50 rounded-2xl border-none font-bold text-slate-600 appearance-none cursor-pointer outline-none focus:ring-4 focus:ring-sky-50"
                value={filters.date}
                onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
              >
                <option value="">Todas as Datas</option>
                {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-44 relative">
              <Clock className="absolute left-5 top-1/2 -translate-y-1/2 text-sky-500" size={20} />
              <select 
                className="w-full pl-14 pr-10 py-5 bg-slate-50 rounded-2xl border-none font-bold text-slate-600 appearance-none cursor-pointer outline-none focus:ring-4 focus:ring-sky-50"
                value={filters.hour}
                onChange={e => setFilters(f => ({ ...f, hour: e.target.value }))}
              >
                <option value="">Hora</option>
                {Array.from({length: 24}).map((_, i) => {
                  const h = i.toString().padStart(2, '0');
                  return <option key={h} value={h}>{h}:00</option>
                })}
              </select>
            </div>
          </div>

          <button 
            onClick={exportPDF}
            className="w-full py-5 bg-yellow-400 hover:bg-yellow-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-lg shadow-yellow-100 active:scale-95"
          >
            <FileText size={22} /> Exportar Playlist PDF
          </button>
        </section>

        <div className="flex flex-col gap-6">
          {loading ? (
            <div className="py-24 text-center">
              <Loader2 className="animate-spin mx-auto text-sky-400 mb-4" size={48} />
              <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Atualizando Playlist...</p>
            </div>
          ) : filteredData.length > 0 ? (
            <>
              {filteredData.slice(0, visibleCount).map((t, idx) => (
                <MusicCard 
                  key={t.id} 
                  track={t} 
                  isNowPlaying={idx === 0 && !filters.search && !filters.hour} 
                />
              ))}
              {filteredData.length > visibleCount && (
                <button 
                  onClick={() => setVisibleCount(c => c + 15)}
                  className="mt-4 py-6 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:border-sky-300 hover:text-sky-500 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={20} /> CARREGAR MAIS REGISTROS
                </button>
              )}
            </>
          ) : (
            <div className="bg-white p-20 rounded-[3rem] text-center border-4 border-dashed border-slate-100">
              <AlertCircle className="mx-auto text-slate-200 mb-4" size={64} />
              <p className="font-black text-slate-400 uppercase text-sm tracking-widest">Nenhum registro encontrado</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
