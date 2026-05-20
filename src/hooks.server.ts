import { connectDB, disconnectDB } from '$lib/server/db';

const DB_WARN = 'MongoDB connection failed — all game state is in-memory only and will be lost on restart:';

connectDB().catch((e) => console.error(DB_WARN, e));

export async function handle({ event, resolve }) {
	try {
		await connectDB();
	} catch (e) {
		console.error(DB_WARN, e);
	}
	return resolve(event);
}

process.on('SIGTERM', async () => {
	await disconnectDB();
	process.exit(0);
});

process.on('SIGINT', async () => {
	await disconnectDB();
	process.exit(0);
});
