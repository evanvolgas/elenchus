from setuptools import setup, find_packages

setup(
    name="test-legacy-project",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "flask>=2.0.0",
        "sqlalchemy>=2.0.0",
    ],
    tests_require=[
        "pytest>=7.0.0",
    ],
)
