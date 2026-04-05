# ============================================================
# Dockerfile — Đóng gói StationMonitor Backend (ARM64/x64)
# Multi-stage build để tối ưu dung lượng Image
# ============================================================

# STAGE 1: Build & Restore
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy toàn bộ giải pháp để restore
COPY ["StationMonitor.sln", "./"]
COPY ["StationMonitor.Api/StationMonitor.Api.csproj", "StationMonitor.Api/"]
COPY ["StationMonitor.Data/StationMonitor.Data.csproj", "StationMonitor.Data/"]
COPY ["StationMonitor.Services/StationMonitor.Services.csproj", "StationMonitor.Services/"]
COPY ["StationMonitor.Workers/StationMonitor.Workers.csproj", "StationMonitor.Workers/"]
COPY ["StationMonitor.Analytics/StationMonitor.Analytics.csproj", "StationMonitor.Analytics/"]

# Restore các NuGet packages
RUN dotnet restore "StationMonitor.sln"

# Copy mã nguồn còn lại
COPY . .

# Build dự án API (nhánh chính)
WORKDIR "/src/StationMonitor.Api"
RUN dotnet build "StationMonitor.Api.csproj" -c Release -o /app/build

# Publish ra thư mục /app/publish
FROM build AS publish
RUN dotnet publish "StationMonitor.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# STAGE 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Cài đặt các thư viện Native cần thiết cho Linux (ARM64/x64)
# - libsnap7-dev: Siemens S7 communication
# - iputils-ping: Hỗ trợ AutoDiscovery (ping quét mạng)
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    libsnap7-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy kết quả publish từ stage 1
COPY --from=publish /app/publish .

# Port mặc định của ASP.NET Core
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

# Chạy ứng dụng
ENTRYPOINT ["dotnet", "StationMonitor.Api.dll"]
