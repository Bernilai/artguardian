from typing import List, Optional
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Ticket, Artifact, User
from app.schemas import TicketCreate, TicketUpdate, TicketResponse
from app.dependencies import get_current_active_user, require_restorer_curator_or_admin
from app.models import User as UserModel
from app.utils.notifications import (
    notify_ticket_assigned,
    notify_ticket_created_unassigned
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[TicketResponse])
async def get_all_tickets(
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_to: Optional[str] = Query(None),
    artifact_id: Optional[str] = Query(None),
    current_user: User = Depends(require_restorer_curator_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get all tickets with optional filters (restorer/curator/admin only)"""
    query = select(Ticket).options(
        selectinload(Ticket.artifact),
        selectinload(Ticket.assigned_to),
        selectinload(Ticket.created_by)
    )
    
    if status_filter:
        query = query.where(Ticket.status == status_filter)
    if assigned_to:
        query = query.where(Ticket.assigned_to_id == assigned_to)
    if artifact_id:
        query = query.where(Ticket.artifact_id == artifact_id)
    
    query = query.order_by(Ticket.created_at.desc())
    
    result = await db.execute(query)
    tickets = result.scalars().all()
    
    # Convert to response format with related data
    ticket_responses = []
    for ticket in tickets:
        ticket_dict = {
            "id": ticket.id,
            "artifact_id": ticket.artifact_id,
            "title": ticket.title,
            "description": ticket.description,
            "status": ticket.status,
            "priority": ticket.priority,
            "assigned_to_id": ticket.assigned_to_id,
            "created_by_id": ticket.created_by_id,
            "notes": ticket.notes,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
            "completed_at": ticket.completed_at,
            "artifact_title": ticket.artifact.title if ticket.artifact else None,
            "assigned_to_name": ticket.assigned_to.name if ticket.assigned_to else None,
            "created_by_name": ticket.created_by.name if ticket.created_by else None,
        }
        ticket_responses.append(TicketResponse(**ticket_dict))
    
    return ticket_responses


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: str,
    current_user: User = Depends(require_restorer_curator_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get a single ticket by ID (restorer/curator/admin only)"""
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.artifact),
            selectinload(Ticket.assigned_to),
            selectinload(Ticket.created_by)
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    ticket_dict = {
        "id": ticket.id,
        "artifact_id": ticket.artifact_id,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "assigned_to_id": ticket.assigned_to_id,
        "created_by_id": ticket.created_by_id,
        "notes": ticket.notes,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "completed_at": ticket.completed_at,
        "artifact_title": ticket.artifact.title if ticket.artifact else None,
        "assigned_to_name": ticket.assigned_to.name if ticket.assigned_to else None,
        "created_by_name": ticket.created_by.name if ticket.created_by else None,
    }
    
    return TicketResponse(**ticket_dict)


@router.post("/", response_model=TicketResponse)
async def create_ticket(
    ticket_data: TicketCreate,
    current_user: UserModel = Depends(require_restorer_curator_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new restoration ticket (restorer/curator/admin only)"""
    # Verify artifact exists
    artifact_result = await db.execute(
        select(Artifact).where(Artifact.id == ticket_data.artifact_id)
    )
    artifact = artifact_result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found"
        )
    
    # Verify assigned user exists and is a restorer (if assigned)
    if ticket_data.assigned_to_id:
        user_result = await db.execute(
            select(User).where(User.id == ticket_data.assigned_to_id)
        )
        assigned_user = user_result.scalar_one_or_none()
        if not assigned_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned user not found"
            )
        if assigned_user.role != "restorer":
            logger.warning(f"User {assigned_user.id} is not a restorer, but assigned to ticket")
    
    # Create ticket
    ticket = Ticket(
        artifact_id=ticket_data.artifact_id,
        title=ticket_data.title,
        description=ticket_data.description,
        priority=ticket_data.priority,
        assigned_to_id=ticket_data.assigned_to_id,
        created_by_id=current_user.id,
        notes=ticket_data.notes,
        status="open"
    )
    
    # When a ticket is created, set artifact status to requires_attention
    if artifact.status != "under_restoration":
        artifact.status = "requires_attention"
        logger.info(f"Updated artifact {artifact.id} status to 'requires_attention' (ticket {ticket.id} created)")
    
    db.add(ticket)
    await db.commit()
    
    # Reload ticket with relationships
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.artifact),
            selectinload(Ticket.assigned_to),
            selectinload(Ticket.created_by)
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    
    ticket_dict = {
        "id": ticket.id,
        "artifact_id": ticket.artifact_id,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "assigned_to_id": ticket.assigned_to_id,
        "created_by_id": ticket.created_by_id,
        "notes": ticket.notes,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "completed_at": ticket.completed_at,
        "artifact_title": ticket.artifact.title if ticket.artifact else None,
        "assigned_to_name": ticket.assigned_to.name if ticket.assigned_to else None,
        "created_by_name": ticket.created_by.name if ticket.created_by else None,
    }
    
    logger.info(f"Created ticket {ticket.id} for artifact {ticket_data.artifact_id}")
    
    # Send notifications
    if ticket.assigned_to_id:
        # Notify assigned restorer
        await notify_ticket_assigned(
            db=db,
            ticket_id=ticket.id,
            ticket_title=ticket.title,
            assigned_to_id=ticket.assigned_to_id,
            artifact_title=ticket.artifact.title if ticket.artifact else None
        )
    else:
        # Notify all restorers about unassigned ticket
        await notify_ticket_created_unassigned(
            db=db,
            ticket_id=ticket.id,
            ticket_title=ticket.title,
            artifact_title=ticket.artifact.title if ticket.artifact else None
        )
    
    await db.commit()  # Commit notification creation
    
    return TicketResponse(**ticket_dict)


@router.put("/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: str,
    ticket_data: TicketUpdate,
    current_user: UserModel = Depends(require_restorer_curator_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a ticket (restorer/curator/admin only)"""
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.artifact),
            selectinload(Ticket.assigned_to),
            selectinload(Ticket.created_by)
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    # Update fields
    if ticket_data.title is not None:
        ticket.title = ticket_data.title
    if ticket_data.description is not None:
        ticket.description = ticket_data.description
    if ticket_data.priority is not None:
        ticket.priority = ticket_data.priority
    if ticket_data.notes is not None:
        ticket.notes = ticket_data.notes
    
    # Handle status change
    if ticket_data.status is not None:
        old_status = ticket.status
        new_status = ticket_data.status
        ticket.status = new_status
        
        # Set completed_at if status changed to completed
        if new_status == "completed" and old_status != "completed":
            ticket.completed_at = datetime.now(timezone.utc)
        elif new_status != "completed" and old_status == "completed":
            ticket.completed_at = None
        
        # Automatically update artifact status based on ticket status
        if ticket.artifact_id:
            artifact_result = await db.execute(
                select(Artifact).where(Artifact.id == ticket.artifact_id)
            )
            artifact = artifact_result.scalar_one_or_none()
            
            if artifact:
                if new_status == "in_progress":
                    # Ticket in progress → artifact under restoration
                    artifact.status = "under_restoration"
                    logger.info(f"Updated artifact {artifact.id} status to 'under_restoration' (ticket {ticket.id} in progress)")
                elif new_status == "completed":
                    # Ticket completed → artifact has no defects
                    artifact.status = "no_defects"
                    logger.info(f"Updated artifact {artifact.id} status to 'no_defects' (ticket {ticket.id} completed)")
                elif new_status == "open" and old_status in ["in_progress", "completed"]:
                    # Ticket reopened → artifact requires attention
                    artifact.status = "requires_attention"
                    logger.info(f"Updated artifact {artifact.id} status to 'requires_attention' (ticket {ticket.id} reopened)")
    
    # Handle assignment
    old_assigned_to_id = ticket.assigned_to_id
    if ticket_data.assigned_to_id is not None:
        if ticket_data.assigned_to_id:
            # Verify user exists
            user_result = await db.execute(
                select(User).where(User.id == ticket_data.assigned_to_id)
            )
            assigned_user = user_result.scalar_one_or_none()
            if not assigned_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assigned user not found"
                )
        ticket.assigned_to_id = ticket_data.assigned_to_id
    
    ticket.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    # Send notification if ticket was newly assigned
    if ticket_data.assigned_to_id is not None and ticket.assigned_to_id and old_assigned_to_id != ticket.assigned_to_id:
        await notify_ticket_assigned(
            db=db,
            ticket_id=ticket.id,
            ticket_title=ticket.title,
            assigned_to_id=ticket.assigned_to_id,
            artifact_title=ticket.artifact.title if ticket.artifact else None
        )
        await db.commit()
    
    # Reload ticket with relationships
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.artifact),
            selectinload(Ticket.assigned_to),
            selectinload(Ticket.created_by)
        )
        .where(Ticket.id == ticket.id)
    )
    ticket = result.scalar_one()
    
    ticket_dict = {
        "id": ticket.id,
        "artifact_id": ticket.artifact_id,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "assigned_to_id": ticket.assigned_to_id,
        "created_by_id": ticket.created_by_id,
        "notes": ticket.notes,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "completed_at": ticket.completed_at,
        "artifact_title": ticket.artifact.title if ticket.artifact else None,
        "assigned_to_name": ticket.assigned_to.name if ticket.assigned_to else None,
        "created_by_name": ticket.created_by.name if ticket.created_by else None,
    }
    
    logger.info(f"Updated ticket {ticket.id}")
    return TicketResponse(**ticket_dict)


@router.delete("/{ticket_id}")
async def delete_ticket(
    ticket_id: str,
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a ticket"""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    # Only allow deletion by admin or creator
    if current_user.role != "admin" and ticket.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this ticket"
        )
    
    await db.delete(ticket)
    await db.commit()
    
    logger.info(f"Deleted ticket {ticket_id}")
    return {"message": "Ticket deleted successfully"}