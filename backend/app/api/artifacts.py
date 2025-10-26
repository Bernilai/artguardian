from typing import List

from fastapi import APIRouter, HTTPException

router = APIRouter()

# Временная имитация, пока без БД
artifacts_db = [
    {
        "id": "1",
        "title": "Портрет неизвестной",
        "description": "Масло, холст, 18 век",
        "inventoryNumber": "Ж-1542",
        "collection": "Живопись",
        "status": "requires_attention",
        "currentLocation": "Зал 3, Стена Западная",
        "lastInspection": "2024-01-15",
        "images": ["/images/portrait-1.jpg"],
        "defects": [
            {
                "id": "d1",
                "type": "crack",
                "severity": "medium",
                "location": "верхний левый угол",
                "detectedDate": "2024-01-15",
                "progress": 15,
                "isActive": True
            }
        ],
        "dimensions": {"width": 60, "height": 80, "unit": "cm"},
        "materials": ["oil_paint", "canvas"],
        "tags": ["портрет", "женский образ", "XVIII век"],
        "createdBy": "Иванов А.П.",
        "createdAt": "2023-05-10T10:00:00Z",
        "updatedAt": "2024-01-15T14:30:00Z"
    }
]

@router.get("/")
async def get_all_artifacts() -> List[dict]:
    return artifacts_db

@router.get("/{artifact_id}")
async def get_artifact(artifact_id: str) -> dict:
    artifact = next((a for a in artifacts_db if a["id"] == artifact_id), None)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact

@router.post("/")
async def create_artifact(artifact: dict) -> dict:
    artifact["id"] = str(len(artifacts_db) + 1)
    artifacts_db.append(artifact)
    return artifact

@router.put("/{artifact_id}")
async def update_artifact(artifact_id: str, artifact_update: dict) -> dict:
    artifact = next((a for a in artifacts_db if a["id"] == artifact_id), None)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact.update(artifact_update)
    return artifact