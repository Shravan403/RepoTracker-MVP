pipeline {
    agent any

    environment {
        IMAGE_NAME = "ghcr.io/shravan403/repotracker-mvp"
        NAMESPACE  = "repotracker"
        KUBECONFIG = "/var/jenkins_home/.kube/config"
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/Shravan403/RepoTracker-MVP'
                echo "✅ Code checked out — commit: ${env.GIT_COMMIT}"
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} \
                                 -t ${IMAGE_NAME}:latest .
                    echo "✅ Image built: ${IMAGE_NAME}:${BUILD_NUMBER}"
                '''
            }
        }

        stage('Push to GitHub Container Registry') {
            steps {
                withCredentials([string(credentialsId: 'ghcr-token',
                                        variable: 'GHCR_TOKEN')]) {
                    sh '''
                        echo ${GHCR_TOKEN} | docker login ghcr.io \
                            -u shravan403 --password-stdin
                        docker push ${IMAGE_NAME}:${BUILD_NUMBER}
                        docker push ${IMAGE_NAME}:latest
                        echo "✅ Image pushed to GHCR"
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh '''
                    # Triggers the update
                    kubectl set image deployment/repotracker \
                        repotracker=${IMAGE_NAME}:${BUILD_NUMBER} \
                        -n ${NAMESPACE}
                        
                    # Natively verifies the health of the new pods
                    kubectl rollout status deployment/repotracker \
                        -n ${NAMESPACE} --timeout=120s
                        
                    echo "✅ Deployment successful and verified healthy by Kubernetes"
                '''
            }
        }

        stage('Health Check / Verification') {
            steps {
                sh '''
                    echo "Retrieving active pods for verification..."
                    kubectl get pods -n ${NAMESPACE} -o wide
                    echo "✅ Pipeline complete!"
                '''
            }
        }

    }

    post {
        success {
            echo "🚀 Pipeline SUCCESS — ${IMAGE_NAME}:${BUILD_NUMBER} deployed"
        }
        failure {
            echo "❌ Pipeline FAILED — rolling back"
            sh '''
                kubectl rollout undo deployment/repotracker \
                    -n ${NAMESPACE} || true
            '''
        }
        always {
            sh 'docker system prune -f || true'
        }
    }
}