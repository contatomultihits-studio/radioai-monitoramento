
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Search, Calendar, Clock, RefreshCw, Radio, 
  FileText, Music, Loader2, AlertCircle, Plus, 
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';

// --- CONFIGURAÇÕES ---
// ID Corrigido conforme o link enviado (IDs de planilha são case-sensitive)
const SHEET_ID = '1xFRBBHpmn38TiBdZcwN2556811FKkfbEEB3HmmdxT1s';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

// --- COMPONENTES ---

const MusicCard = ({ track, isNowPlaying }: { track: any, isNowPlaying: boolean }) => {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    };
    fetchCover();
  }, [track.artista, track.musica]);

  const cardStyle = isNowPlaying 
    ? "bg-slate-900 border-l-8 border-yellow-400 shadow-2xl scale-[1.02] z-10" 
    : "bg-white border border-slate-100 hover:shadow-lg hover:-translate-y-1";

  return (
    <div className={`flex items-center gap-4 p-4 sm:p-6 rounded-[2rem] transition-all duration-300 ${cardStyle}`}>
      <div className={`relative flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-inner ${isNowPlaying ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-20 h-20 sm:w-24 sm:h-24'}`}>
        {loading ? (
          <div className="w-full h-full animate-pulse bg-slate-200 flex items-center justify-center">
             <Loader2 className="animate-spin text-slate-300" />
          </div>
        ) : artwork ? (
          <img src={artwork.replace('100x100', '400x400')} alt="Capa" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Music size={isNowPlaying ? 40 : 30} />
          </div>
        )}
      </div>

      <div className="flex-grow min-w-0">
        {isNowPlaying && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500 text-[10px] font-black text-white uppercase tracking-tighter mb-2 animate-pulse">
            <Radio size={10} /> No Ar Agora
          </span>
        )}
        <h3 className={`font-black uppercase truncate leading-tight ${isNowPlaying ? 'text-white text-xl sm:text-2xl' : 'text-slate-800 text-lg'}`}>
          {track.musica}
        </h3>
        <p className={`font-bold uppercase truncate ${isNowPlaying ? 'text-yellow-400' : 'text-sky-500'}`}>
          {track.artista}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold tabular-nums text-xs ${isNowPlaying ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-500'}`}>
            <Clock size={12} /> {track.hora}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isNowPlaying ? 'text-white/40' : 'text-slate-300'}`}>
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
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ date: '', hour: '', search: '' });
  const [visibleCount, setVisibleCount] = useState(15);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${CSV_URL}&cache_bust=${Date.now()}`);
      if (!response.ok) throw new Error("Não foi possível acessar a planilha. Verifique se o compartilhamento está ativado.");
      
      const csvText = await response.text();
      const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
      
      if (lines.length < 2) throw new Error("A planilha parece estar vazia.");

      const parseCSVLine = (line: string) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else cur += char;
        }
        result.push(cur.trim());
        return result;
      };

      const rows = lines.map(parseCSVLine);
      const header = rows[0].map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
      
      // Mapeamento baseado no cabeçalho enviado: artista, musica, tocou_em
      const idxArtista = header.indexOf('artista');
      const idxMusica = header.indexOf('musica');
      const idxTocouEm = header.indexOf('tocou_em');

      if (idxArtista === -1 || idxMusica === -1) {
        throw new Error(`Colunas não encontradas. Detectadas: ${header.join(', ')}`);
      }

      const formatted = rows.slice(1).map((row, i) => {
        const fullTime = row[idxTocouEm] || '';
        // Assume formato "DD/MM/YYYY HH:MM:SS" ou "DD/MM/YYYY HH:MM"
        const parts = fullTime.split(' ');
        const dataStr = parts[0] || '---';
        const horaStr = parts[1] ? parts[1].substring(0, 5) : '--:--';

        return {
          id: `row-${i}`,
          data: dataStr,
          hora: horaStr,
          artista: row[idxArtista] || 'Desconhecido',
          musica: row[idxMusica] || 'Sem Título'
        };
      }).filter(t => t.artista !== 'Desconhecido');

      const sorted = formatted.sort((a, b) => {
        const [dA, mA, yA] = a.data.split('/');
        const [dB, mB, yB] = b.data.split('/');
        const timeA = `${yA}${mA}${dA} ${a.hora}`;
        const timeB = `${yB}${mB}${dB} ${b.hora}`;
        return timeB.localeCompare(timeA);
      });

      setData(sorted);
      if (sorted.length > 0 && !filters.date) setFilters(f => ({ ...f, date: sorted[0].data }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.date]);

  useEffect(() => { fetchData(); }, []);

  const filteredData = useMemo(() => {
    return data.filter(t => {
      const matchDate = filters.date ? t.data === filters.date : true;
      const matchHour = filters.hour ? t.hora.startsWith(filters.hour) : true;
      const matchSearch = filters.search 
        ? (t.artista + t.musica).toLowerCase().includes(filters.search.toLowerCase()) 
        : true;
      return matchDate && matchHour && matchSearch;
    });
  }, [data, filters]);

  const uniqueDates = useMemo(() => [...new Set(data.map(d => d.data))], [data]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO DE PLAYLIST - METROPOLITANA FM", 14, 20);
    doc.setFontSize(10);
    doc.text(`Filtro Data: ${filters.date || 'Geral'} | Gerado em: ${new Date().toLocaleDateString()}`, 14, 28);
    
    let y = 40;
    doc.text("HORA", 14, y); doc.text("ARTISTA", 40, y); doc.text("MÚSICA", 110, y);
    doc.line(14, y + 2, 196, y + 2);
    
    doc.setFont("helvetica", "normal");
    filteredData.slice(0, 100).forEach(t => {
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(t.hora, 14, y);
      doc.text(t.artista.substring(0, 30), 40, y);
      doc.text(t.musica.substring(0, 35), 110, y);
    });
    doc.save(`Playlist_${filters.date.replace(/\//g, '-') || 'Geral'}.pdf`);
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2 rounded-xl text-white shadow-lg shadow-yellow-200">
              <Radio size={24} />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tighter text-slate-900 leading-none">METROPOLITANA FM</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Dashboard Diretor</p>
            </div>
          </div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl transition-all"
          >
            <RefreshCw className={`${loading ? 'animate-spin text-sky-500' : 'text-slate-400'}`} size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 mt-8">
        {error ? (
          <div className="bg-white p-10 rounded-[2.5rem] border-2 border-red-50 text-center shadow-xl shadow-red-100/20">
            <AlertCircle className="mx-auto text-red-400 mb-4" size={50} />
            <h2 className="text-xl font-black text-slate-800 mb-2">Falha na Sincronização</h2>
            <p className="text-slate-500 mb-6 text-sm max-w-xs mx-auto">{error}</p>
            <div className="flex flex-col gap-2 max-w-sm mx-auto text-left bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-700">O que verificar:</p>
                <li className="text-xs text-slate-500 list-none">• Menu: Arquivo > Compartilhar > Publicar na Web</li>
                <li className="text-xs text-slate-500 list-none">• Selecionar "Valores separados por vírgula (.csv)"</li>
                <li className="text-xs text-slate-500 list-none">• Garantir que a primeira aba tem as colunas exatas.</li>
            </div>
            <button onClick={fetchData} className="mt-6 px-6 py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-2 mx-auto hover:bg-slate-700 transition-all">
               Recarregar Dashboard
            </button>
          </div>
        ) : (
          <>
            <section className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/40 mb-10 border border-white">
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input 
                  type="text" 
                  placeholder="Busca inteligente por música ou artista..." 
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 outline-none focus:ring-4 focus:ring-sky-50 transition-all"
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-grow relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} />
                  <select 
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-600 appearance-none cursor-pointer outline-none focus:ring-4 focus:ring-sky-50"
                    value={filters.date}
                    onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
                  >
                    <option value="">Todas as Datas</option>
                    {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="sm:w-40 relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} />
                  <select 
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-600 appearance-none cursor-pointer outline-none"
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
                className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-lg shadow-yellow-100 active:scale-[0.98]"
              >
                <Download size={20} /> Exportar Playlist PDF
              </button>
            </section>

            <div className="flex flex-col gap-6">
              {loading ? (
                <div className="py-20 text-center">
                  <Loader2 className="animate-spin mx-auto text-sky-400 mb-4" size={40} />
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Sincronizando com a rádio...</p>
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
                      className="mt-4 py-5 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:border-sky-300 hover:text-sky-500 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={20} /> CARREGAR MAIS REGISTROS
                    </button>
                  )}
                </>
              ) : (
                <div className="bg-white p-20 rounded-[3rem] text-center border-4 border-dashed border-slate-100">
                  <AlertCircle className="mx-auto text-slate-200 mb-4" size={60} />
                  <p className="font-black text-slate-400 uppercase text-sm tracking-widest">Nenhum registro encontrado</p>
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
