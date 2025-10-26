from typing import List

from fastapi import APIRouter

router = APIRouter()

tickets_db = []

@router.get("/")
async def get_all_tickets() -> List[dict]:
    return tickets_db

@router.post("/")
async def create_ticket(ticket: dict) -> dict:
    ticket["id"] = str(len(tickets_db) + 1)
    ticket["status"] = "open"
    tickets_db.append(ticket)
    return ticket