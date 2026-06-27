export const GameConfig = {
    // Target logical resolution (16:9 for landscape games, usually 1920x1080)
    width: 1920,
    height: 1080,
    
    // Auto resize options
    autoResize: true,
    resolution: window.devicePixelRatio || 1,
    
    // Background color
    backgroundColor: '#000000',
    
    // Reel dimensions config (placeholder for the real setup)
    reels: {
        cols: 5,
        rows: 3,
        symbolWidth: 200,
        symbolHeight: 200,
        padding: 10,
    }
};
