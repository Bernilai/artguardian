"""
ArtDet integration service for automatic damage detection in artifacts.
This service wraps the ArtDet Mask R-CNN model for detecting deterioration
in paintings.

The service uses TensorFlow SavedModel format for inference (compatible with
TensorFlow 2.16+).
"""

import logging
from pathlib import Path
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Try to import ArtDet dependencies
try:
    import tensorflow as tf
    from mrcnn import model as modellib
    from mrcnn.config import Config
    from skimage import color
    from skimage import io as skimage_io
    from skimage.transform import resize
    from tensorflow.python.framework import (
        tensor_util,  # For converting SymbolicTensor to NumPy array
    )

    ARTDET_AVAILABLE = True
except ImportError as e:
    logger.warning(f"ArtDet dependencies not available: {e}")
    ARTDET_AVAILABLE = False
    tensor_util = None
    tf = None
    modellib = None
    Config = None
    color = None


if ARTDET_AVAILABLE:

    class ArtDetConfig(Config):
        """Configuration for ArtDet damage detection model."""

        NAME = "damage"
        IMAGES_PER_GPU = 1
        NUM_CLASSES = 1 + 1  # Background + damage
        STEPS_PER_EPOCH = 100
        DETECTION_MIN_CONFIDENCE = 0.9
        DETECTION_NMS_THRESHOLD = 0.3
        IMAGE_MIN_DIM = 800
        IMAGE_MAX_DIM = 1024
        IMAGE_RESIZE_MODE = "square"
        BACKBONE = "resnet101"
        GPU_COUNT = 1
        MEAN_PIXEL = np.array([123.7, 116.8, 103.9])  # RGB mean pixel values
else:
    # Dummy class when ArtDet is not available
    class ArtDetConfig:
        """Configuration for ArtDet damage detection model."""

        NAME = "damage"
        IMAGES_PER_GPU = 1
        NUM_CLASSES = 1 + 1
        STEPS_PER_EPOCH = 100
        DETECTION_MIN_CONFIDENCE = 0.9
        DETECTION_NMS_THRESHOLD = 0.3
        IMAGE_MIN_DIM = 800
        IMAGE_MAX_DIM = 1024
        IMAGE_RESIZE_MODE = "square"
        BACKBONE = "resnet101"
        GPU_COUNT = 1
        MEAN_PIXEL = np.array([123.7, 116.8, 103.9])  # RGB mean pixel values


class ArtDetService:
    """Service for running ArtDet damage detection on artifact images."""

    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize ArtDet service.

        Args:
            model_path: Path to the TensorFlow SavedModel directory; directory
                must contain saved_model.pb
        """
        if not ARTDET_AVAILABLE:
            raise RuntimeError(
                "ArtDet dependencies not installed. "
                "Please install: tensorflow, scikit-image, and Mask-RCNN"
            )

        if model_path is None:
            artdet_dir = Path(__file__).parent.parent.parent.parent / "artdet" / "model"
            backend_model_dir = Path(__file__).parent.parent.parent / "model"

            tf_model_paths = [
                backend_model_dir / "model-maskrcnn-tf",
                artdet_dir / "model-maskrcnn-tf",
            ]

            for tf_path in tf_model_paths:
                if tf_path.exists() and (tf_path / "saved_model.pb").exists():
                    model_path = str(tf_path)
                    self.model_format = "saved_model"
                    break

            if model_path is None:
                raise FileNotFoundError(
                    "Model weights not found. Please download model-maskrcnn-tf.zip "
                    "(TensorFlow SavedModel format) and extract it to "
                    "backend/model/model-maskrcnn-tf/"
                )
        else:
            model_path_obj = Path(model_path)
            if model_path_obj.is_dir() and (model_path_obj / "saved_model.pb").exists():
                self.model_format = "saved_model"
            else:
                raise ValueError(
                    f"Invalid model path: {model_path}. "
                    "Only TensorFlow SavedModel format "
                    "(directory with saved_model.pb) is supported."
                )

        self.model_path = model_path
        self.model = None
        self.config = ArtDetConfig()
        self._load_model()

    def _load_model(self):
        """Load the ArtDet model using TensorFlow SavedModel format."""
        logger.info(f"Loading ArtDet model from SavedModel: {self.model_path}")

        try:
            self.model = tf.saved_model.load(self.model_path)
            logger.info("SavedModel loaded successfully")

            self.infer_fn = None
            if hasattr(self.model, "signatures") and self.model.signatures:
                available_sigs = list(self.model.signatures.keys())
                logger.info(f"Available SavedModel signatures: {available_sigs}")

                try:
                    if "serving_default" in available_sigs:
                        self.infer_fn = self.model.signatures["serving_default"]
                        logger.info(
                            f"Loaded 'serving_default' signature: {type(self.infer_fn)}"
                        )
                    elif "infer" in available_sigs:
                        self.infer_fn = self.model.signatures["infer"]
                        logger.info(f"Loaded 'infer' signature: {type(self.infer_fn)}")
                    elif available_sigs:
                        self.infer_fn = self.model.signatures[available_sigs[0]]
                        logger.info(
                            f"Loaded first available signature "
                            f"'{available_sigs[0]}': {type(self.infer_fn)}"
                        )
                except (KeyError, AttributeError, TypeError) as sig_err:
                    logger.error(f"Error accessing signature: {sig_err}", exc_info=True)

            if self.infer_fn is not None:
                logger.info(
                    "ArtDet model loaded successfully using SavedModel signature"
                )
            else:
                raise RuntimeError("No inference signature found in SavedModel")

        except Exception as e:
            logger.error(f"Failed to load ArtDet model: {e}", exc_info=True)
            raise RuntimeError(
                f"Failed to load ArtDet model from {self.model_path}. Error: {str(e)}"
            ) from e

    def detect_damage(self, image_path: str, min_confidence: float = 0.9) -> Dict:
        """
        Detect damage in an artifact image.

        Args:
            image_path: Path to the image file
            min_confidence: Minimum confidence threshold for detections

        Returns:
            Dictionary containing:
            - detected: bool - Whether damage was detected
            - damage_count: int - Number of damage regions detected
            - damage_percentage: float - Percentage of image area with damage
            - damage_areas: List[Dict] - Detected damage regions with coordinates
            - confidence_scores: List[float] - Confidence scores for each detection
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        try:
            image = skimage_io.imread(image_path)

            if image.ndim == 2:
                image = color.gray2rgb(image)
            elif image.ndim == 4:
                image = image[0]

            if image.shape[2] > 3:
                image = image[:, :, :3]

            try:
                infer = None
                if hasattr(self, "infer_fn") and self.infer_fn is not None:
                    infer = self.infer_fn
                else:
                    if hasattr(self.model, "signatures"):
                        try:
                            available_signatures = (
                                list(self.model.signatures.keys())
                                if self.model.signatures
                                else []
                            )
                            if "serving_default" in available_signatures:
                                infer = self.model.signatures["serving_default"]
                            elif available_signatures:
                                infer = self.model.signatures[available_signatures[0]]
                        except Exception as sig_error:
                            logger.error(
                                f"Error accessing signatures: {sig_error}",
                                exc_info=True,
                            )

                if infer is None:
                    return {
                        "detected": False,
                        "damage_count": 0,
                        "damage_percentage": 0.0,
                        "damage_areas": [],
                        "confidence_scores": [],
                    }

                if image.ndim != 3:
                    image = color.gray2rgb(image)
                img_rgb = image[..., :3].astype(np.float32)

                image_resized = resize(
                    img_rgb,
                    (self.config.IMAGE_MAX_DIM, self.config.IMAGE_MAX_DIM),
                    preserve_range=True,
                )

                if hasattr(self.config, "MEAN_PIXEL"):
                    img_preprocessed = image_resized - self.config.MEAN_PIXEL
                else:
                    img_preprocessed = image_resized - np.array([123.7, 116.8, 103.9])

                img_arr = np.expand_dims(img_preprocessed, axis=0)
                input_tensor = tf.convert_to_tensor(img_arr, dtype=tf.float32)

                image_meta = np.array(
                    [[image_resized.shape[0], image_resized.shape[1], 3] + [0] * 11],
                    dtype=np.float32,
                )
                inputs_1 = tf.convert_to_tensor(image_meta, dtype=tf.float32)

                roi_count = getattr(self.config, "POST_NMS_ROIS_INFERENCE", 1000)
                roi_count = max(roi_count, 2000)
                rois = np.zeros((1, roi_count, 4), dtype=np.float32)
                inputs_2 = tf.convert_to_tensor(rois, dtype=tf.float32)

                original_eager = tf.config.functions_run_eagerly()
                try:
                    tf.config.run_functions_eagerly(True)

                    try:
                        outputs = infer(
                            inputs=input_tensor, inputs_1=inputs_1, inputs_2=inputs_2
                        )

                        error_keys = []
                        for key, val in outputs.items():
                            try:
                                if hasattr(val, "op") and hasattr(val.op, "type"):
                                    op_type = val.op.type
                                    if "Error" in op_type or "InvalidArgument" in str(
                                        val.op
                                    ):
                                        error_keys.append(key)
                            except Exception:
                                pass

                        if error_keys:
                            return {
                                "detected": False,
                                "damage_count": 0,
                                "damage_percentage": 0.0,
                                "damage_areas": [],
                                "confidence_scores": [],
                            }

                        # Try to convert outputs immediately if they're symbolic tensors
                        evaluated_outputs = {}
                        for key, val in outputs.items():
                            try:
                                if "SymbolicTensor" in str(type(val)) or (
                                    "Tensor" in str(type(val))
                                    and not hasattr(val, "numpy")
                                ):
                                    try:
                                        eval_val = tf.keras.backend.get_value(val)
                                        if isinstance(eval_val, np.ndarray):
                                            evaluated_outputs[key] = eval_val
                                            continue
                                    except Exception:
                                        pass
                                evaluated_outputs[key] = val
                            except Exception:
                                evaluated_outputs[key] = val

                        # Use evaluated outputs if we got any
                        if any(
                            isinstance(v, np.ndarray)
                            for v in evaluated_outputs.values()
                        ):
                            outputs = evaluated_outputs

                    except Exception as e:
                        logger.error(f"Inference failed: {e}", exc_info=True)
                        return {
                            "detected": False,
                            "damage_count": 0,
                            "damage_percentage": 0.0,
                            "damage_areas": [],
                            "confidence_scores": [],
                        }
                finally:
                    tf.config.run_functions_eagerly(original_eager)

                def to_numpy(tensor_val):
                    """Convert tensor to numpy array"""
                    if tensor_val is None:
                        return None
                    if isinstance(tensor_val, np.ndarray):
                        return tensor_val
                    if tensor_util is not None:
                        try:
                            return tensor_util.MakeNdarray(tensor_val)
                        except (AttributeError, TypeError, ValueError):
                            pass
                    if hasattr(tensor_val, "numpy"):
                        try:
                            return tensor_val.numpy()
                        except (NotImplementedError, TypeError, AttributeError):
                            pass
                    return tensor_val

                rois = None
                class_ids = None
                scores = None
                masks = None

                def convert_output(key):
                    """Convert output tensor to numpy using tensor_util"""
                    if key not in outputs:
                        return None
                    val = outputs[key]

                    # If already numpy, return as-is
                    if isinstance(val, np.ndarray):
                        return val

                    # Check if it's a symbolic tensor (graph mode)
                    is_symbolic = "SymbolicTensor" in str(type(val)) or (
                        "Tensor" in str(type(val)) and not hasattr(val, "numpy")
                    )
                    if is_symbolic:
                        # Try to evaluate symbolic tensor
                        try:
                            np_val = tf.keras.backend.get_value(val)
                            if isinstance(np_val, np.ndarray):
                                return np_val
                        except Exception:
                            pass

                        try:
                            np_val = tf.keras.backend.batch_get_value([val])[0]
                            if isinstance(np_val, np.ndarray):
                                return np_val
                        except Exception:
                            pass

                        # Try session evaluation
                        try:
                            if hasattr(tf.compat.v1, "Session"):
                                graph = (
                                    val.graph
                                    if hasattr(val, "graph")
                                    else tf.compat.v1.get_default_graph()
                                )
                                with tf.compat.v1.Session(graph=graph) as sess:
                                    try:
                                        sess.run(
                                            tf.compat.v1.global_variables_initializer()
                                        )
                                    except Exception:
                                        pass
                                    np_val = sess.run(val)
                                    if isinstance(np_val, np.ndarray):
                                        return np_val
                        except Exception:
                            pass

                    # Try tensor_util.MakeNdarray first (ArtDet's approach)
                    if tensor_util is not None:
                        try:
                            np_val = tensor_util.MakeNdarray(val)
                            if isinstance(np_val, np.ndarray):
                                return np_val
                        except (AttributeError, TypeError, ValueError):
                            pass

                    # Fallback to to_numpy
                    np_val = to_numpy(val)
                    if isinstance(np_val, np.ndarray):
                        return np_val

                    # Last resort: try .numpy() directly
                    if hasattr(val, "numpy"):
                        try:
                            return val.numpy()
                        except Exception:
                            pass

                    return None

                # Extract outputs
                output_0 = convert_output("output_0")
                output_1 = convert_output("output_1")
                output_3 = convert_output("output_3")
                output_4 = convert_output("output_4")

                # Try alternative key names
                if output_0 is None:
                    output_0 = convert_output("rois")
                if output_1 is None:
                    output_1 = convert_output("class_ids")
                if output_3 is None:
                    output_3 = convert_output("masks")
                if output_4 is None:
                    output_4 = convert_output("scores")

                # If critical outputs are None, return empty results
                if output_0 is None and output_3 is None:
                    return {
                        "detected": False,
                        "damage_count": 0,
                        "damage_percentage": 0.0,
                        "damage_areas": [],
                        "confidence_scores": [],
                    }

                # Process output_0 - shape (1, 100, 6):
                # [y1, x1, y2, x2, class_id, score]
                if output_0 is not None and isinstance(output_0, np.ndarray):
                    if len(output_0.shape) == 3 and output_0.shape[-1] == 6:
                        # Combined format: extract rois, class_ids, and scores
                        output_0_data = output_0[0]  # Remove batch dimension: (100, 6)
                        rois = output_0_data[
                            :, :4
                        ]  # First 4 columns are bbox: (100, 4)
                        class_ids = output_0_data[:, 4].astype(
                            np.int32
                        )  # Column 4 is class_id: (100,)
                        scores = output_0_data[:, 5]  # Column 5 is score: (100,)
                    elif len(output_0.shape) == 3 and output_0.shape[-1] == 4:
                        rois = output_0[0]  # Just bboxes: (N, 4)
                    elif len(output_0.shape) == 2:
                        rois = output_0
                    else:
                        rois = output_0

                # Process output_1 - class_ids or probabilities
                # (only if not extracted from output_0)
                if (
                    class_ids is None
                    and output_1 is not None
                    and isinstance(output_1, np.ndarray)
                ):
                    if len(output_1.shape) == 3 and output_1.shape[-1] == 2:
                        # Class probabilities: (1, 1000, 2) -> argmax, top 100
                        class_probs = np.argmax(output_1[0], axis=-1)  # (1000,)
                        # If we have rois, take corresponding class_ids
                        if (
                            rois is not None
                            and isinstance(rois, np.ndarray)
                            and len(rois.shape) > 0
                        ):
                            num_detections = (
                                rois.shape[0] if len(rois.shape) > 1 else len(rois) // 4
                            )
                            class_ids = (
                                class_probs[:num_detections]
                                if num_detections <= len(class_probs)
                                else class_probs
                            )
                        else:
                            class_ids = class_probs
                    elif len(output_1.shape) == 2:
                        class_ids = output_1[0] if output_1.shape[0] == 1 else output_1
                    else:
                        class_ids = output_1

                # Process output_4 - scores (only if not extracted from output_0)
                if (
                    scores is None
                    and output_4 is not None
                    and isinstance(output_4, np.ndarray)
                ):
                    if len(output_4.shape) == 3:
                        # Might be (1, 1000, 4) - bounding boxes, not scores
                        # Skip this case
                        scores = None
                    elif len(output_4.shape) == 2:
                        scores = output_4[0] if output_4.shape[0] == 1 else output_4
                    else:
                        scores = output_4

                # Process output_3 - masks shape (1, 100, 28, 28, 2)
                # Expected format: (H, W, N) where N is number of detections
                if output_3 is not None and isinstance(output_3, np.ndarray):
                    if len(output_3.shape) == 5:
                        # Shape: (1, 100, 28, 28, 2) -> (28, 28, 100)
                        masks = output_3[0, :, :, :, 0]  # (100, 28, 28)
                        masks = np.transpose(masks, (1, 2, 0))  # (28, 28, 100)
                    elif len(output_3.shape) == 4:
                        masks_temp = output_3[0]  # Remove batch dimension
                        if masks_temp.shape[0] < masks_temp.shape[-1]:
                            masks = np.transpose(masks_temp, (1, 2, 0))
                        else:
                            masks = masks_temp
                    elif len(output_3.shape) == 3:
                        masks = output_3
                    else:
                        masks = output_3

                # Ensure all are numpy arrays or None
                if rois is None:
                    rois = np.array([]).reshape(0, 4)
                elif not isinstance(rois, np.ndarray):
                    rois = np.array([]).reshape(0, 4)

                if class_ids is None:
                    class_ids = np.array([])
                elif not isinstance(class_ids, np.ndarray):
                    class_ids = np.array([])

                if scores is None:
                    scores = np.array([])
                elif not isinstance(scores, np.ndarray):
                    scores = np.array([])

                if masks is None:
                    masks = np.zeros(
                        (image_resized.shape[0], image_resized.shape[1], 0)
                    )
                elif not isinstance(masks, np.ndarray):
                    masks = np.zeros(
                        (image_resized.shape[0], image_resized.shape[1], 0)
                    )

                # Create results dict
                results = {
                    "rois": rois,
                    "class_ids": class_ids,
                    "scores": scores,
                    "masks": masks,
                }

                # Ensure all results are numpy arrays (not tensors)
                def ensure_numpy(val):
                    """Ensure value is a numpy array"""
                    if val is None:
                        return np.array([])
                    if hasattr(val, "numpy"):
                        np_val = val.numpy()
                        if len(np_val.shape) > 1 and np_val.shape[0] == 1:
                            return np_val[0]
                        return np_val
                    if isinstance(val, np.ndarray):
                        return val
                    return np.array(val)

                # Convert all results to numpy arrays
                results["rois"] = ensure_numpy(results["rois"])
                results["class_ids"] = ensure_numpy(results["class_ids"])
                results["scores"] = ensure_numpy(results["scores"])
                if results["masks"] is not None:
                    results["masks"] = ensure_numpy(results["masks"])

                # Filter by confidence
                total_detections = (
                    results["scores"].shape[0]
                    if len(results["scores"].shape) > 0
                    else 0
                )

                if total_detections == 0:
                    return {
                        "detected": False,
                        "damage_count": 0,
                        "damage_percentage": 0.0,
                        "damage_areas": [],
                        "confidence_scores": [],
                    }

                valid_indices = np.where(results["scores"] >= min_confidence)[0]

                if valid_indices.shape[0] == 0:
                    return {
                        "detected": False,
                        "damage_count": 0,
                        "damage_percentage": 0.0,
                        "damage_areas": [],
                        "confidence_scores": [],
                    }

                # Extract valid detections
                rois = results["rois"][valid_indices]
                scores = results["scores"][valid_indices]
                masks = results["masks"][:, :, valid_indices]

                # Calculate damage percentage
                image_area = image_resized.shape[0] * image_resized.shape[1]
                damage_pixels = np.sum(np.any(masks, axis=2))
                damage_percentage = (damage_pixels / image_area) * 100

                # Extract damage regions with bounding boxes
                damage_areas = []
                scale_y = image.shape[0] / image_resized.shape[0]
                scale_x = image.shape[1] / image_resized.shape[1]

                for i, roi in enumerate(rois):
                    y1, x1, y2, x2 = roi
                    scaled_bbox = {
                        "x1": int(x1 * scale_x),
                        "y1": int(y1 * scale_y),
                        "x2": int(x2 * scale_x),
                        "y2": int(y2 * scale_y),
                    }
                    confidence = float(scores[i])

                    damage_areas.append({"bbox": scaled_bbox, "confidence": confidence})

                return {
                    "detected": True,
                    "damage_count": len(valid_indices),
                    "damage_percentage": round(damage_percentage, 2),
                    "damage_areas": damage_areas,
                    "confidence_scores": [float(s) for s in scores],
                }

            except Exception as e:
                logger.error(f"Error during SavedModel inference: {e}", exc_info=True)
                return {
                    "detected": False,
                    "damage_count": 0,
                    "damage_percentage": 0.0,
                    "damage_areas": [],
                    "confidence_scores": [],
                }

        except Exception as e:
            logger.error(f"Error during damage detection: {e}", exc_info=True)
            return {
                "detected": False,
                "damage_count": 0,
                "damage_percentage": 0.0,
                "damage_areas": [],
                "confidence_scores": [],
            }


# Global service instance (lazy loaded)
_artdet_service: Optional[ArtDetService] = None


def get_artdet_service() -> Optional[ArtDetService]:
    """
    Get or create the global ArtDet service instance.
    Returns None if ArtDet is not available.
    """
    global _artdet_service

    if not ARTDET_AVAILABLE:
        return None

    if _artdet_service is None:
        try:
            _artdet_service = ArtDetService()
        except Exception as e:
            logger.error(f"Failed to initialize ArtDet service: {e}")
            return None

    return _artdet_service


def is_artdet_available() -> bool:
    """Check if ArtDet is available and ready to use."""
    return ARTDET_AVAILABLE and get_artdet_service() is not None
