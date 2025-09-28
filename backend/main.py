from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import mood  

app = FastAPI(title="Mindscape Compass API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(mood.router)

#app.include_router(navigation.router)