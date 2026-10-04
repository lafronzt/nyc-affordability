import type { APIRoute, GetStaticPaths } from 'astro';
import { loadDatasets } from '../../lib/loadDatasets';
import { toCsv, manifest } from '../../lib/dataExport';

// Static files generated at build time: /data/<id>.json, /data/<id>.csv, and
// the /data/index.json manifest. No request ever reaches a server.
export const getStaticPaths: GetStaticPaths = async () => {
  const datasets = await loadDatasets();
  return [
    { params: { file: 'index.json' } },
    ...datasets.flatMap((d) => [{ params: { file: `${d.id}.json` } }, { params: { file: `${d.id}.csv` } }]),
  ];
};

export const GET: APIRoute = async ({ params }) => {
  const datasets = await loadDatasets();
  const file = params.file!;
  if (file === 'index.json') {
    const generated = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(manifest(datasets, generated), null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const [id, ext] = [file.replace(/\.(json|csv)$/, ''), file.split('.').pop()];
  const ds = datasets.find((d) => d.id === id)!;
  if (ext === 'csv') return new Response(toCsv(ds), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
  const { columns, ...rest } = ds;
  return new Response(JSON.stringify({ ...rest, license: 'CC0-1.0', columns }, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
