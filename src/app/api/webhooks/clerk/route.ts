import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Clerk webhook: keeps the local `User` table in sync with Clerk identities.
 * Configure a Clerk webhook endpoint pointing here for user.created,
 * user.updated, and user.deleted events. Payloads are verified with svix.
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  let evt: WebhookEvent;
  try {
    evt = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const { id, email_addresses, primary_email_address_id, first_name, last_name } =
        evt.data;
      const email =
        email_addresses.find((e) => e.id === primary_email_address_id)
          ?.email_address ?? email_addresses[0]?.email_address;
      if (!email) break;

      const name = [first_name, last_name].filter(Boolean).join(" ") || null;

      await prisma.user.upsert({
        where: { clerkUserId: id },
        update: { email, name },
        create: { clerkUserId: id, email, name },
      });
      break;
    }
    case "user.deleted": {
      const id = evt.data.id;
      if (id) {
        await prisma.user.deleteMany({ where: { clerkUserId: id } });
      }
      break;
    }
    default:
      break;
  }

  return new Response("ok", { status: 200 });
}
