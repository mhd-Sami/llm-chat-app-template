import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Serve frontend
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// GET chat history
		if (url.pathname === "/api/history" && request.method === "GET") {
			const { results } = await env.DB.prepare(
				"SELECT role, content FROM chat_history ORDER BY id ASC"
			).all();

			return Response.json(results);
		}

		// CHAT API
		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handleChat(request, env);
		}

		return new Response("Not found", { status: 404 });
	},
};

async function handleChat(request: Request, env: Env): Promise<Response> {
	try {
		const { messages } = await request.json();

		if (!messages.some(m => m.role === "system")) {
			messages.unshift({
				role: "system",
				content: SYSTEM_PROMPT,
			});
		}

		// Save user message
		const lastUser = [...messages]
			.reverse()
			.find(m => m.role === "user")?.content;

		if (lastUser) {
			await env.DB.prepare(
				"INSERT INTO chat_history (role, content) VALUES (?, ?)"
			)
				.bind("user", lastUser)
				.run();
		}

		// ✅ Correct Cloudflare AI streaming
		const response = await env.AI.run(MODEL_ID, {
			messages,
			stream: true,
			max_tokens: 1024,
		});

		return new Response(response, {
			headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});

	} catch (err) {
		console.error("Chat error:", err);
		return new Response(
			JSON.stringify({ error: "Worker crashed", detail: String(err) }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			}
		);
	}
}
