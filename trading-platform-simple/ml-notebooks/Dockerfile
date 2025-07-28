FROM jupyter/scipy-notebook:latest

# Switch to root to install packages
USER root

# Install additional packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Switch back to jovyan user
USER jovyan

# Install Python packages for ML and trading
RUN pip install --no-cache-dir \
    yfinance \
    alpha_vantage \
    ta \
    ta-lib \
    scikit-learn \
    xgboost \
    lightgbm \
    tensorflow \
    torch \
    plotly \
    dash \
    streamlit \
    fastapi \
    uvicorn \
    redis \
    sqlalchemy \
    asyncio \
    websockets \
    requests \
    beautifulsoup4 \
    selenium \
    ccxt

# Set the working directory
WORKDIR /home/jovyan/work

# Copy initial notebooks
COPY --chown=jovyan:users . .

# Create directories for organized work
RUN mkdir -p data models research shared

# Expose Jupyter port
EXPOSE 8888

# Start Jupyter Lab
CMD ["start-notebook.sh", "--NotebookApp.token=''", "--NotebookApp.password=''"]