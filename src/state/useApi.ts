import { useMemo } from 'react';
import { ApiClient } from '../api/client';
import { useServers } from './servers';

export function useApi(directory?: string) {
  const { active } = useServers();
  return useMemo(() => (active ? new ApiClient(active, directory) : null), [active, directory]);
}
