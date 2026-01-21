import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Search, Calendar, Clock, RefreshCw, Radio, 
  Music, Loader2, AlertCircle, Plus, Download 
} from 'lucide-react';
import { jsPDF } from 'jspdf';

// --- CONFIGURAÇÕES ---
const SHEET_ID = '1xFRBBHpmn38TiBdZcwN2556811FKkfbEEB3HmmdxT1s';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const REFRESH_INTERVAL_MS = 30000;

const MusicCard = ({ track, isNowPlaying }: { track: any, isNowPlaying: boolean }) => {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [loadingCover, setLoadingCover] = useState(true);

  useEffect(() => {
    const fetchCover = async () => {
      const query = `${track.artista} ${track.musica}`.toLowerCase().trim();
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
        const data = await res.json();
        setArtwork(data.results?.[0]?.artworkUrl100 || null);
      } catch (e) {
        setArtwork(null);
      } finally {
        setLoadingCover(false);
      }
    };
    fetchCover();
  }, [track.artista, track.musica]);

  const cardStyle = isNowPlaying 
    ? "bg-slate-900 border-l-8 border-yellow-400 shadow-2xl scale-[1.02] z-10" 
    : "bg-white border border-slate-200 hover:shadow-lg hover:-translate-y-1";

  const textColor = isNowPlaying ? "text-white" : "text-slate-800";
  const subTextColor = isNowPlaying ? "text-yellow-400" : "text-sky-500";

  return (
    <div className={`flex items-center gap-4 p-5 rounded-[2rem] transition-all duration-300 ${cardStyle}`}>
      <div className={`relative flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-inner ${isNowPlaying ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-20 h-20'}`}>
        {loadingCover ? (
          <div className="w-full h-full animate-pulse bg-slate-200 flex items-center justify-center">
             <Loader2 className="animate-spin text-slate-300" size={20} />
          </div>
        ) : artwork ? (
          <img src={artwork.replace('100x100', '400x400')} alt="Capa" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Music size={isNowPlaying ? 40 : 24} />
          </div>
        )}
      </div>

      <div className="flex-grow min-w-0">
        {isNowPlaying && (
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
            <span className="text-[10px] font-black text-white uppercase tracking-tighter">No Ar Agora</span>
          </div>
        )}
        <h3 className={`font-black uppercase truncate leading-tight text-lg ${textColor}`}>
          {track.musica}
        </h3>
        <p className={`font-bold uppercase truncate text-sm mb-2 ${subTextColor}`}>
          {track.artista}
        </p>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold tabular-nums text-[10px] ${isNowPlaying ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'}`}>
            <Clock size={12} /> {track.hora}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isNowPlaying ? 'text-white/40' : 'text-slate-400'}`}>
            {track.data}
          </span>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Adicionado filtro de Rádio
  const [filters, setFilters] = useState({ date: '', hour: '', search: '', radio: 'Metropolitana FM' });
  const [visibleCount, setVisibleCount] = useState(15);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`${CSV_URL}&cache_bust=${Date.now()}`);
      if (!response.ok) throw new Error("Acesso negado à planilha.");
      
      const csvText = await response.text();
      const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) throw new Error("Planilha vazia ou formato inválido.");

      const rows = lines.map(line => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
          else cur += char;
        }
        result.push(cur.trim());
        return result;
      });

      const header = rows[0].map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const idxArtista = header.indexOf('artista');
      const idxMusica = header.indexOf('musica');
      const idxTocouEm = header.indexOf('tocou_em');
      const idxRadio = header.indexOf('radio'); // Nova coluna detectada

      if (idxArtista === -1 || idxMusica === -1 || idxTocouEm === -1) {
        throw new Error("Colunas essenciais não encontradas.");
      }

      const formatted = rows.slice(1).map((row, i) => {
        const rawTime = row[idxTocouEm] || '';
        const [d, t] = rawTime.split(' ');
        return {
          id: `t-${i}`,
          artista: row[idxArtista] || 'Desconhecido',
          musica: row[idxMusica] || 'Sem Título',
          radio: row[idxRadio] || 'Metropolitana FM', // Lê o nome da rádio
          data: d || '---',
          hora: t ? t.substring(0, 5) : '00:00'
        };
      }).filter(t => t.artista !== 'artista'); 

      const sorted = formatted.sort((a, b) => {
        const parseDate = (dStr: string, tStr: string) => {
          const [d, m, y] = dStr.split('/');
          return new Date(`${y}-${m}-${d}T${tStr}`).getTime();
        };
        return parseDate(b.data, b.hora) - parseDate(a.data, a.hora);
      });

      setData(sorted);
      if (sorted.length > 0 && !filters.date) {
        setFilters(prev => prev.date ? prev : { ...prev, date: sorted[0].data });
      }
    } catch (err: any) {
      if (!isSilent) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters.date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => { fetchData(true); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return data.filter(t => {
      const matchRadio = filters.radio ? t.radio === filters.radio : true;
      const matchDate = filters.date ? t.data === filters.date : true;
      const matchHour = filters.hour ? t.hora.startsWith(filters.hour) : true;
      const matchSearch = filters.search 
        ? (t.artista + t.musica).toLowerCase().includes(filters.search.toLowerCase()) 
        : true;
      return matchRadio && matchDate && matchHour && matchSearch;
    });
  }, [data, filters]);

  const uniqueDates = useMemo(() => [...new Set(data.map(d => d.data))], [data]);
  const uniqueRadios = useMemo(() => [...new Set(data.map(d => d.radio))], [data]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`RÁDIO AI - ${filters.radio}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Data: ${filters.date || 'Todas'} | Gerado em: ${new Date().toLocaleString()}`, 14, 28);
    
    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.text("HORA", 14, y); doc.text("ARTISTA", 40, y); doc.text("MÚSICA", 100, y);
    doc.line(14, y + 2, 196, y + 2);
    
    doc.setFont("helvetica", "normal");
    filteredData.slice(0, 100).forEach(t => {
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(t.hora, 14, y);
      doc.text(t.artista.substring(0, 30), 40, y);
      doc.text(t.musica.substring(0, 45), 100, y);
    });
    doc.save(`Monitoramento_${filters.radio}_${filters.date.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2 rounded-xl text-white shadow-lg">
              <Radio size={24} />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tighter text-slate-900 leading-none uppercase">RÁDIO AI</h1>
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] mt-1">Monitoramento - {filters.radio}</p>
            </div>
          </div>
          <button onClick={() => fetchData()} className={`p-3 rounded-xl transition-all ${refreshing ? 'bg-slate-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
            <RefreshCw className={`${refreshing ? 'animate-spin text-sky-500' : 'text-slate-400'}`} size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {error ? (
          <div className="bg-white p-12 rounded-[3rem] shadow-xl text-center border-2 border-red-50">
            <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
            <h2 className="text-xl font-black text-slate-800 mb-2">Erro de Conexão</h2>
            <p className="text-slate-500 text-sm mb-8">{error}</p>
            <button onClick={() => fetchData()} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all">
              Tentar Novamente
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 mb-10 border border-slate-100">
              {/* Seletor de Rádio */}
              <div className="flex gap-2 mb-4 p-1 bg-slate-100 rounded-2xl">
                {['Metropolitana FM', 'Antena 1'].map(r => (
                  <button
                    key={r}
                    onClick={() => setFilters(f => ({ ...f, radio: r }))}
                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${filters.radio === r ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input 
                  type="text" 
                  placeholder="Pesquisar por artista ou música..." 
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 outline-none focus:ring-4 focus:ring-sky-50 transition-all placeholder:text-slate-300"
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 mb-4">
                <div className="flex-grow relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} />
                  <select 
                    className="w-full pl-12 pr-10 py-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-600 appearance-none outline-none focus:ring-4 focus:ring-sky-50"
                    value={filters.date}
                    onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
                  >
                    <option value="">Todas as Datas</option>
                    {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={exportPDF} className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all shadow-lg shadow-yellow-100">
                <Download size={18} /> Exportar Playlist PDF
              </button>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="py-20 text-center">
                  <Loader2 className="animate-spin mx-auto text-sky-400 mb-4" size={40} />
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Sincronizando DADOS...</p>
                </div>
              ) : filteredData.length > 0 ? (
                <>
                  {filteredData.slice(0, visibleCount).map((track, idx) => (
                    <MusicCard 
                      key={track.id} 
                      track={track} 
                      isNowPlaying={idx === 0 && !filters.search && !filters.hour}
                    />
                  ))}
                  {filteredData.length > visibleCount && (
                    <button onClick={() => setVisibleCount(c => c + 15)} className="w-full py-6 rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:bg-white hover:border-sky-300 hover:text-sky-500 transition-all flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest">
                      <Plus size={16} /> Carregar Mais
                    </button>
                  )}
                </>
              ) : (
                <div className="bg-white p-20 rounded-[3rem] text-center border-4 border-dashed border-slate-100">
                  <p className="font-black text-slate-300 uppercase text-xs tracking-widest">Nenhum registro para {filters.radio}</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
