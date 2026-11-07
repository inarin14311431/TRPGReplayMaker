import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useGuild = () => useContext(Ctx);

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([]);
  const [guildId, setGuildId] = useState(null);
  const [error, setError] = useState(null);

  const refreshGuilds = useCallback(async () => {
    try {
      const list = await api.guilds();
      const valid = Array.isArray(list) ? list : [];
      setGuilds(valid);
      setGuildId(cur => valid.some(g => g.id === cur) ? cur : (valid[0]?.id || null));
      setError(null);
      return valid;
    } catch (err) {
      setError(err?.message || 'サーバー情報の取得に失敗しました。');
      return [];
    }
  }, []);

  useEffect(() => { refreshGuilds(); }, [refreshGuilds]);

  return <Ctx.Provider value={{ guilds, guildId, setGuildId, error, refreshGuilds }}>{children}</Ctx.Provider>;
}
