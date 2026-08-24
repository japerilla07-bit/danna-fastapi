frontend-builder
RUN cd frontend && npm run build
4s
> danna-frontend@0.1.0 build
> tsc -b && vite build
src/components/Quantumpilot.tsx(27,26): error TS2307: Cannot find module '@/components/RadarMap' or its corresponding type declarations.


runtime
COPY requirements.txt .
166ms

runtime
RUN pip install --no-cache-dir -r requirements.txt
3s
Collecting fastapi==0.115.0 (from -r requirements.txt (line 1))
  Downloading fastapi-0.115.0-py3-none-any.whl.metadata (27 kB)
Collecting uvicorn==0.30.0 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading uvicorn-0.30.0-py3-none-any.whl.metadata (6.3 kB)
Collecting python-jose==3.3.0 (from python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading python_jose-3.3.0-py2.py3-none-any.whl.metadata (5.4 kB)
Collecting python-multipart==0.0.9 (from -r requirements.txt (line 4))
  Downloading python_multipart-0.0.9-py3-none-any.whl.metadata (2.5 kB)
Collecting numpy==2.2.6 (from -r requirements.txt (line 5))
  Downloading numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (62 kB)
Collecting pandas==2.3.3 (from -r requirements.txt (line 6))
  Downloading pandas-2.3.3-cp312-cp312-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (91 kB)
Collecting scikit-learn==1.7.2 (from -r requirements.txt (line 7))
  Downloading scikit_learn-1.7.2-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (11 kB)
Collecting scipy==1.15.3 (from -r requirements.txt (line 8))
  Downloading scipy-1.15.3-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (61 kB)
Collecting joblib==1.5.2 (from -r requirements.txt (line 9))
  Downloading joblib-1.5.2-py3-none-any.whl.metadata (5.6 kB)
Collecting requests==2.32.5 (from -r requirements.txt (line 10))
  Downloading requests-2.32.5-py3-none-any.whl.metadata (4.9 kB)
Collecting PyYAML==6.0.3 (from -r requirements.txt (line 11))
  Downloading pyyaml-6.0.3-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (2.4 kB)
Collecting bcrypt==4.2.0 (from -r requirements.txt (line 12))
  Downloading bcrypt-4.2.0-cp39-abi3-manylinux_2_28_x86_64.whl.metadata (9.6 kB)
Collecting starlette<0.39.0,>=0.37.2 (from fastapi==0.115.0->-r requirements.txt (line 1))
  Downloading starlette-0.38.6-py3-none-any.whl.metadata (6.0 kB)
Collecting pydantic!=1.8,!=1.8.1,!=2.0.0,!=2.0.1,!=2.1.0,<3.0.0,>=1.7.4 (from fastapi==0.115.0->-r requirements.txt (line 1))
  Downloading pydantic-2.13.4-py3-none-any.whl.metadata (109 kB)
Collecting typing-extensions>=4.8.0 (from fastapi==0.115.0->-r requirements.txt (line 1))
  Downloading typing_extensions-4.16.0-py3-none-any.whl.metadata (3.3 kB)
Collecting click>=7.0 (from uvicorn==0.30.0->uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading click-8.4.2-py3-none-any.whl.metadata (2.6 kB)
Collecting h11>=0.8 (from uvicorn==0.30.0->uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading h11-0.16.0-py3-none-any.whl.metadata (8.3 kB)
Collecting ecdsa!=0.15 (from python-jose==3.3.0->python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading ecdsa-0.19.2-py2.py3-none-any.whl.metadata (29 kB)
Collecting rsa (from python-jose==3.3.0->python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading rsa-4.9.1-py3-none-any.whl.metadata (5.6 kB)
Collecting pyasn1 (from python-jose==3.3.0->python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading pyasn1-0.6.4-py3-none-any.whl.metadata (8.4 kB)
Collecting python-dateutil>=2.8.2 (from pandas==2.3.3->-r requirements.txt (line 6))
  Downloading python_dateutil-2.9.0.post0-py2.py3-none-any.whl.metadata (8.4 kB)
Collecting pytz>=2020.1 (from pandas==2.3.3->-r requirements.txt (line 6))
  Downloading pytz-2026.3.post1-py2.py3-none-any.whl.metadata (22 kB)
Collecting tzdata>=2022.7 (from pandas==2.3.3->-r requirements.txt (line 6))
  Downloading tzdata-2026.3-py2.py3-none-any.whl.metadata (1.4 kB)
Collecting threadpoolctl>=3.1.0 (from scikit-learn==1.7.2->-r requirements.txt (line 7))
  Downloading threadpoolctl-3.6.0-py3-none-any.whl.metadata (13 kB)
Collecting charset_normalizer<4,>=2 (from requests==2.32.5->-r requirements.txt (line 10))
  Downloading charset_normalizer-3.5.1-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (45 kB)
Collecting idna<4,>=2.5 (from requests==2.32.5->-r requirements.txt (line 10))
  Downloading idna-3.19-py3-none-any.whl.metadata (9.2 kB)
Collecting urllib3<3,>=1.21.1 (from requests==2.32.5->-r requirements.txt (line 10))
  Downloading urllib3-2.7.0-py3-none-any.whl.metadata (6.9 kB)
Collecting certifi>=2017.4.17 (from requests==2.32.5->-r requirements.txt (line 10))
  Downloading certifi-2026.7.22-py3-none-any.whl.metadata (2.5 kB)
Collecting cryptography>=3.4.0 (from python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading cryptography-50.0.0-cp311-abi3-manylinux_2_34_x86_64.whl.metadata (4.3 kB)
Collecting httptools>=0.5.0 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading httptools-0.8.0-cp312-cp312-manylinux1_x86_64.manylinux_2_28_x86_64.manylinux_2_5_x86_64.whl.metadata (3.5 kB)
Collecting python-dotenv>=0.13 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading python_dotenv-1.2.3-py3-none-any.whl.metadata (29 kB)
Collecting uvloop!=0.15.0,!=0.15.1,>=0.14.0 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading uvloop-0.22.1-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (4.9 kB)
Collecting watchfiles>=0.13 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading watchfiles-1.2.0-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (4.9 kB)
Collecting websockets>=10.4 (from uvicorn[standard]==0.30.0->-r requirements.txt (line 2))
  Downloading websockets-17.0.1-cp312-cp312-manylinux1_x86_64.manylinux_2_28_x86_64.manylinux_2_5_x86_64.whl.metadata (6.3 kB)
Collecting cffi>=2.0.0 (from cryptography>=3.4.0->python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading cffi-2.1.1-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (2.5 kB)
Collecting six>=1.9.0 (from ecdsa!=0.15->python-jose==3.3.0->python-jose[cryptography]==3.3.0->-r requirements.txt (line 3))
  Downloading six-1.17.0-py2.py3-none-any.whl.metadata (1.7 kB)
Collecting annotated-types>=0.6.0 (from pydantic!=1.8,!=1.8.1,!=2.0.0,!=2.0.1,!=2.1.0,<3.0.0,>=1.7.4->fastapi==0.115.0->-r requirements.txt (line 1))
  Downloading annotated_types-0.8.0-py3-none-any.whl.metadata (15 kB)
scheduling build on Metal builder "builder-ftsqoq"
Build Failed: build daemon returned an error < failed to solve: process "/bin/sh -c cd frontend && npm run build" did not complete successfully: exit code: 2 >
You reached the end of the range
2026-08-24 12:48