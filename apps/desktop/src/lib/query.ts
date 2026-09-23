import { QueryClient } from '@tanstack/react-query';
export function createLocalClient() {
  return new QueryClient({ defaultOptions: { queries: { networkMode: 'always', retry: false, refetchOnWindowFocus: true, staleTime: 500 }, mutations: { networkMode: 'always', retry: false } } });
}
