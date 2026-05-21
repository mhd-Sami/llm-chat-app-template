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
	const { messages } = await request.json();

	if (!messages.some(m => m.role === "system")) {
		messages.unshift({ role: "system", content: SYSTEM_PROMPT });
	}

	const lastUserMessage =
		[...messages].reverse().find(m => m.role === "user")?.content;

	// Save user message
	if (lastUserMessage) {
		await env.DB.prepare(
			"INSERT INTO chat_history (role, content) VALUES (?, ?)"
		)
			.bind("user", lastUserMessage)
			.run();
	}

	const aiStream = await env.AI.run(
		MODEL_ID,
		{
			messages,
			stream: true,
			max_tokens: 1024,
		}
	);

	const reader = aiStream.getReader();
	const decoder = new TextDecoder();

	let fullResponse = "";

	const stream = new ReadableStream({
		async start(controller) {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				fullResponse += decoder.decode(value);
				controller.enqueue(value);
			}

			// Save AI response
			if (fullResponse) {
				await env.DB.prepare(
					"INSERT INTO chat_history (role, content) VALUES (?, ?)"
				)
					.bind("assistant", fullResponse)
					.run();
			}

			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
		},
	});
}
