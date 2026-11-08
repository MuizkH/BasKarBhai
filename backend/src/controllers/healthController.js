/**
 * Controller to handle API health check
 */
export const getHealthStatus = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Voice Accountability API is running'
  });
};

