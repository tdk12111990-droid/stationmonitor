# ============================================================
# Dockerfile — StationMonitor Backend (x86_64)
# ============================================================

# STAGE 1: Build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["StationMonitor.sln", "./"]
COPY ["StationMonitor.Api/StationMonitor.Api.csproj", "StationMonitor.Api/"]
COPY ["StationMonitor.Data/StationMonitor.Data.csproj", "StationMonitor.Data/"]
COPY ["StationMonitor.Services/StationMonitor.Services.csproj", "StationMonitor.Services/"]
COPY ["StationMonitor.Workers/StationMonitor.Workers.csproj", "StationMonitor.Workers/"]
COPY ["StationMonitor.Analytics/StationMonitor.Analytics.csproj", "StationMonitor.Analytics/"]
COPY ["StationMonitor.Tests/StationMonitor.Tests.csproj", "StationMonitor.Tests/"]
COPY ["StationMonitor.Simulators/StationMonitor.Simulators.csproj", "StationMonitor.Simulators/"]

RUN dotnet restore "StationMonitor.sln"
COPY . .
WORKDIR "/src/StationMonitor.Api"
RUN dotnet publish "StationMonitor.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# STAGE 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "StationMonitor.Api.dll"]
