import logging
from datetime import datetime, timedelta, timezone
from typing import Dict

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import Artifact, Ticket, User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Dict:
    """Get dashboard statistics"""

    # Total artifacts
    total_artifacts_result = await db.execute(select(func.count(Artifact.id)))
    total_artifacts = total_artifacts_result.scalar_one() or 0

    # Artifacts requiring attention (status: requires_attention)
    attention_artifacts_result = await db.execute(
        select(func.count(Artifact.id)).where(Artifact.status == "requires_attention")
    )
    attention_artifacts = attention_artifacts_result.scalar_one() or 0

    # Critical artifacts (status: has_defects - artifacts with detected defects)
    critical_artifacts_result = await db.execute(
        select(func.count(Artifact.id)).where(Artifact.status == "has_defects")
    )
    critical_artifacts = critical_artifacts_result.scalar_one() or 0

    # Open tickets (status: open or in_progress)
    open_tickets_result = await db.execute(
        select(func.count(Ticket.id)).where(Ticket.status.in_(["open", "in_progress"]))
    )
    open_tickets = open_tickets_result.scalar_one() or 0

    # Tickets in progress
    in_progress_tickets_result = await db.execute(
        select(func.count(Ticket.id)).where(Ticket.status == "in_progress")
    )
    in_progress_tickets = in_progress_tickets_result.scalar_one() or 0

    # Open tickets (not in progress)
    just_open_tickets_result = await db.execute(
        select(func.count(Ticket.id)).where(Ticket.status == "open")
    )
    just_open_tickets = just_open_tickets_result.scalar_one() or 0

    # Calculate trends (last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    # New artifacts in last 30 days
    new_artifacts_result = await db.execute(
        select(func.count(Artifact.id)).where(Artifact.created_at >= thirty_days_ago)
    )
    new_artifacts_count = new_artifacts_result.scalar_one() or 0

    # New tickets requiring attention in last 7 days
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    new_attention_result = await db.execute(
        select(func.count(Artifact.id)).where(
            and_(
                Artifact.status == "requires_attention",
                Artifact.updated_at >= seven_days_ago,
            )
        )
    )
    new_attention_count = new_attention_result.scalar_one() or 0

    # New critical artifacts in last 7 days
    new_critical_result = await db.execute(
        select(func.count(Artifact.id)).where(
            and_(
                Artifact.status == "has_defects", Artifact.updated_at >= seven_days_ago
            )
        )
    )
    new_critical_count = new_critical_result.scalar_one() or 0

    # Format trends
    total_trend = (
        f"+{new_artifacts_count} за месяц"
        if new_artifacts_count > 0
        else "Без изменений"
    )
    attention_trend = (
        f"{new_attention_count} новых" if new_attention_count > 0 else "Без изменений"
    )
    critical_trend = (
        f"+{new_critical_count} за неделю"
        if new_critical_count > 0
        else "Без изменений"
    )

    # Tickets trend logic - show breakdown of open and in_progress
    if open_tickets == 0:
        tickets_trend = "Все закрыты"
    elif in_progress_tickets > 0 and just_open_tickets > 0:
        tickets_trend = f"{in_progress_tickets} в работе, {just_open_tickets} открыто"
    elif in_progress_tickets > 0:
        tickets_trend = f"{in_progress_tickets} в работе"
    elif just_open_tickets > 0:
        tickets_trend = f"{just_open_tickets} открыто"
    else:
        tickets_trend = "Все закрыты"

    return {
        "total_artifacts": {"value": str(total_artifacts), "trend": total_trend},
        "attention_artifacts": {
            "value": str(attention_artifacts),
            "trend": attention_trend,
        },
        "critical_artifacts": {
            "value": str(critical_artifacts),
            "trend": critical_trend,
        },
        "open_tickets": {"value": str(open_tickets), "trend": tickets_trend},
    }
